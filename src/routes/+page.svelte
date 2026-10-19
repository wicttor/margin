<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { homeDir } from "@tauri-apps/api/path";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import {
    basename,
    dirname,
    isMarkdown,
    listDir,
    localLinkTarget,
    MARKDOWN_EXTENSIONS,
    openInDefaultApp,
    pathExists,
    printPage,
    readFile,
    takePendingOpens,
    watchFolder,
    writeFile,
  } from "$lib/api";
  import { app, Tab } from "$lib/state.svelte";
  import Editor from "$lib/Editor.svelte";
  import TreeNode from "$lib/TreeNode.svelte";
  import TerminalView from "$lib/TerminalView.svelte";
  import { terminals } from "$lib/terminals.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Menu, { type MenuSections } from "$lib/ui/Menu.svelte";
  import OverlayHost from "$lib/ui/OverlayHost.svelte";
  import WindowControls from "$lib/ui/WindowControls.svelte";
  import { overlays } from "$lib/ui/overlays.svelte";
  import { accelLabel, isMac } from "$lib/ui/platform";
  import { tooltip } from "$lib/ui/tooltip";

  const SESSION_KEY = "margin.session";
  const markdownFilter = [{ name: "Markdown", extensions: MARKDOWN_EXTENSIONS }];

  let restored = false;
  let focused = $state(true);
  let home = $state<string | null>(null);
  let menu = $state<{ sections: MenuSections; anchor: DOMRect | { x: number; y: number } } | null>(
    null,
  );

  // ---------- folder ----------

  async function setFolder(path: string) {
    app.folder = path;
    app.listings = {};
    app.expanded.clear();
    await app.loadListing(path);
    watchFolder(path).catch((e) => console.warn("Cannot watch folder:", e));
  }

  async function chooseFolder() {
    const path = await open({ directory: true, defaultPath: app.folder ?? undefined });
    if (typeof path === "string") await setFolder(path);
  }

  // ---------- tabs ----------

  async function openFile(path: string) {
    const existing = app.tabs.find((t) => t.path === path);
    if (existing) {
      app.activeId = existing.id;
      return;
    }
    try {
      const file = await readFile(path);
      if (file.kind === "external") {
        // Images, PDFs and other binary files open in the system's default app.
        await openInDefaultApp(path);
        return;
      }
      const tab = new Tab(path, file.text, isMarkdown(path) ? "markdown" : "code");
      app.tabs.push(tab);
      app.activeId = tab.id;
    } catch {
      overlays.toast(`Could not open “${basename(path)}”`);
    }
  }

  async function chooseFiles() {
    const picked = await open({ multiple: true });
    for (const path of picked ?? []) await openFile(path);
  }

  function newFile() {
    const tab = new Tab(null, "");
    app.tabs.push(tab);
    app.activeId = tab.id;
  }

  async function saveTab(tab: Tab, saveAs = false): Promise<boolean> {
    tab.flush?.();
    let path = tab.path;
    if (!path || saveAs) {
      const markdownTab = tab.kind === "markdown";
      const fallbackName = markdownTab ? `${tab.name}.md` : tab.name;
      const picked = await save({
        filters: markdownTab ? markdownFilter : undefined,
        defaultPath: path ?? (app.folder ? `${app.folder}/${fallbackName}` : fallbackName),
      });
      if (!picked) return false;
      path = !markdownTab || isMarkdown(picked) ? picked : `${picked}.md`;
    }
    try {
      await writeFile(path, tab.content);
    } catch {
      overlays.toast(`Could not save “${basename(path)}”`);
      return false;
    }
    tab.path = path;
    tab.markSaved();
    return true;
  }

  /** Asks about unsaved changes. Returns false if the user cancelled. */
  async function confirmDiscard(tab: Tab): Promise<boolean> {
    tab.flush?.();
    if (!tab.dirty) return true;
    app.activeId = tab.id;
    const answer = await overlays.alert({
      heading: "Save Changes?",
      body: `“${tab.name}” contains unsaved changes. Changes which are not saved will be permanently lost.`,
      responses: [
        { id: "cancel", label: "Cancel" },
        { id: "discard", label: "Discard", appearance: "destructive" },
        { id: "save", label: "Save", appearance: "suggested" },
      ],
      defaultResponse: "save",
      closeResponse: "cancel",
    });
    if (answer === "save") return saveTab(tab);
    return answer === "discard";
  }

  async function closeTab(tab: Tab) {
    if (!(await confirmDiscard(tab))) return;
    const index = app.tabs.indexOf(tab);
    app.tabs.splice(index, 1);
    if (app.activeId === tab.id) {
      app.activeId = (app.tabs[index] ?? app.tabs[index - 1])?.id ?? null;
    }
  }

  async function closeOtherTabs(keep: Tab) {
    for (const tab of app.tabs.filter((t) => t !== keep)) {
      if (!(await confirmDiscard(tab))) return;
      app.tabs.splice(app.tabs.indexOf(tab), 1);
    }
    app.activeId = keep.id;
  }

  function cycleTab(step: number) {
    if (app.tabs.length < 2 || !app.active) return;
    const index = app.tabs.indexOf(app.active);
    app.activeId = app.tabs[(index + step + app.tabs.length) % app.tabs.length].id;
  }

  function toggleSource() {
    const tab = app.active;
    if (tab?.kind === "markdown") tab.mode = tab.mode === "source" ? "wysiwyg" : "source";
  }

  function print() {
    if (!app.active) return;
    app.active.preparePrint?.();
    printPage();
  }

  async function followLink(href: string, tab: Tab) {
    const target = localLinkTarget(href, tab.path);
    if (target === null) {
      if (!href.startsWith("#")) await openUrl(href).catch(() => {});
      return;
    }
    await openFile(target);
  }

  // ---------- menus ----------

  function mainMenu(): MenuSections {
    return [
      [
        { label: "_New Document", accel: accelLabel("Primary+N"), action: newFile },
        { label: "_Open File…", accel: accelLabel("Primary+O"), action: chooseFiles },
        { label: "Open _Folder…", accel: accelLabel("Primary+Shift+O"), action: chooseFolder },
        { label: "New _Terminal", accel: "Ctrl+Shift+`", action: () => terminals.create() },
      ],
      [
        {
          label: "Sa_ve As…",
          accel: accelLabel("Primary+Shift+S"),
          disabled: !app.active,
          action: () => app.active && saveTab(app.active, true),
        },
        {
          label: "_Print…",
          accel: accelLabel("Primary+P"),
          disabled: !app.active,
          action: print,
        },
      ],
      [
        {
          label: "Markdown _Source",
          accel: accelLabel("Primary+/"),
          checked: app.active?.mode === "source",
          disabled: app.active?.kind !== "markdown",
          action: toggleSource,
        },
        {
          label: "Side_bar",
          accel: "F9",
          checked: app.sidebarOpen,
          action: () => (app.sidebarOpen = !app.sidebarOpen),
        },
      ],
      [
        {
          label: "_Keyboard Shortcuts",
          accel: accelLabel("Primary+?"),
          action: () => (overlays.dialog = "shortcuts"),
        },
        { label: "_About Margin", action: () => (overlays.dialog = "about") },
      ],
    ];
  }

  function openMainMenu(button?: HTMLElement | null) {
    button ??= document.querySelector<HTMLElement>(".main-menu-button");
    if (button) menu = { sections: mainMenu(), anchor: button.getBoundingClientRect() };
  }

  function openTabMenu(e: MouseEvent, tab: Tab) {
    e.preventDefault();
    menu = {
      anchor: { x: e.clientX, y: e.clientY },
      sections: [
        [
          {
            label: "Close _Other Tabs",
            disabled: app.tabs.length < 2,
            action: () => closeOtherTabs(tab),
          },
          { label: "_Close", accel: accelLabel("Primary+W"), action: () => closeTab(tab) },
        ],
      ],
    };
  }

  // ---------- external changes ----------

  let changed = new Set<string>();
  let changeTimer: ReturnType<typeof setTimeout> | undefined;

  function onFsChange(paths: string[]) {
    for (const p of paths) changed.add(p);
    clearTimeout(changeTimer);
    changeTimer = setTimeout(applyFsChanges, 200);
  }

  async function applyFsChanges() {
    const paths = [...changed];
    changed = new Set();
    const dirs = new Set(paths.map(dirname));
    for (const dir of dirs) if (app.listings[dir]) await app.loadListing(dir);
    for (const p of paths) if (app.listings[p]) await app.loadListing(p);

    for (const tab of app.tabs) {
      if (!tab.path || !paths.includes(tab.path) || tab.dirty) continue;
      try {
        const file = await readFile(tab.path);
        if (file.kind === "text" && file.text !== tab.diskText) tab.reload(file.text);
      } catch {
        // Deleted or moved: keep the tab so nothing is lost.
      }
    }
  }

  // ---------- session ----------

  function saveSession() {
    if (!restored) return;
    const session = {
      folder: app.folder,
      files: app.tabs.map((t) => t.path).filter(Boolean),
      active: app.active?.path ?? null,
      sidebarOpen: app.sidebarOpen,
      terminalHeight: terminals.panelHeight,
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }

  async function restoreSession() {
    let session: any = null;
    try {
      session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    } catch {}
    if (session) {
      app.sidebarOpen = session.sidebarOpen ?? true;
      terminals.panelHeight = session.terminalHeight ?? terminals.panelHeight;
      if (session.folder && (await pathExists(session.folder))) await setFolder(session.folder);
      for (const path of session.files ?? []) {
        if (await pathExists(path)) await openFile(path);
      }
      const active = app.tabs.find((t) => t.path === session.active);
      if (active) app.activeId = active.id;
    }
    restored = true;
  }

  async function openPending() {
    for (const path of await takePendingOpens()) await openFile(path);
  }

  $effect(saveSession);

  $effect(() => {
    const tab = app.active;
    const title = tab ? `${tab.dirty ? "• " : ""}${tab.name} — Margin` : "Margin";
    getCurrentWindow().setTitle(title).catch(() => {});
  });

  /** The folder shown under the window title, with the home folder shortened to "~". */
  let subtitle = $derived.by(() => {
    const path = app.active?.path;
    if (!path) return app.active ? "Unsaved document" : "";
    const dir = dirname(path);
    if (home && dir.startsWith(home)) return "~" + dir.slice(home.replace(/[\\/]$/, "").length);
    return dir;
  });

  // ---------- shortcuts ----------

  function onKeydown(e: KeyboardEvent) {
    if (overlays.alerts.length || menu) return;
    // Ctrl+` shows or hides the terminal area and Ctrl+Shift+` opens a terminal, as in VS Code.
    if (e.code === "Backquote" && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) terminals.create();
      else terminals.togglePanel();
      return;
    }
    // In a terminal, keys like Ctrl+W, Ctrl+P and Ctrl+R belong to the shell.
    const inTerminal = (e.target as Element | null)?.closest?.(".terminal-area");
    if (inTerminal && e.key !== "F9" && e.key !== "F10") return;
    const cmd = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();
    let action: (() => unknown) | undefined;

    if (e.key === "F9") action = () => (app.sidebarOpen = !app.sidebarOpen);
    else if (e.key === "F10") action = () => openMainMenu();
    else if (e.ctrlKey && e.key === "Tab") action = () => cycleTab(e.shiftKey ? -1 : 1);
    else if (cmd && e.key === "PageDown") action = () => cycleTab(1);
    else if (cmd && e.key === "PageUp") action = () => cycleTab(-1);
    else if (e.altKey && !cmd && /^[1-9]$/.test(e.key)) {
      const tab = app.tabs[Number(e.key) - 1];
      if (tab) action = () => (app.activeId = tab.id);
    } else if (cmd && !e.altKey) {
      const actions: Record<string, (() => unknown) | undefined> = {
        s: () => app.active && saveTab(app.active, e.shiftKey),
        o: () => (e.shiftKey ? chooseFolder() : chooseFiles()),
        n: newFile,
        t: newFile,
        w: () => app.active && closeTab(app.active),
        p: print,
        // In code files, Ctrl+/ is left to the editor, which toggles a comment.
        "/": app.active?.kind === "markdown" ? toggleSource : undefined,
        "?": () => (overlays.dialog = "shortcuts"),
      };
      action = actions[e.shiftKey && key === "/" ? "?" : key];
    }
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  }

  /** Drags the line between the documents and the terminal area. */
  function startTerminalResize(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    const content = handle.closest(".content")!.getBoundingClientRect();
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const height = content.bottom - ev.clientY;
      terminals.panelHeight = Math.round(Math.min(content.height - 160, Math.max(120, height)));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  onMount(() => {
    homeDir().then((h) => (home = h), () => {});
    const cleanups: Promise<() => void>[] = [
      listen<string[]>("fs-change", (e) => onFsChange(e.payload)),
      listen("open-files", openPending),
      getCurrentWebview().onDragDropEvent(async (e) => {
        if (e.payload.type !== "drop") return;
        for (const path of e.payload.paths) {
          if (await listDir(path).then(() => true, () => false)) await setFolder(path);
          else await openFile(path);
        }
      }),
      getCurrentWindow().onCloseRequested(async (e) => {
        for (const tab of app.tabs) tab.flush?.();
        if (!app.tabs.some((t) => t.dirty)) return;
        e.preventDefault();
        for (const tab of [...app.tabs]) {
          if (!(await confirmDiscard(tab))) return;
        }
        await getCurrentWindow().destroy();
      }),
    ];
    restoreSession().then(openPending);
    return () => cleanups.forEach((c) => c.then((un) => un()));
  });
</script>

<svelte:window
  onkeydowncapture={onKeydown}
  onfocus={() => (focused = true)}
  onblur={() => (focused = false)}
/>

{#snippet mainMenuButton()}
  <button
    class="btn image flat main-menu-button"
    class:checked={menu !== null && menu.sections.length > 1}
    use:tooltip={"Main Menu"}
    onclick={(e) => openMainMenu(e.currentTarget)}
  >
    <Icon name="open-menu" />
  </button>
{/snippet}

<div class="window" class:backdrop={!focused} class:mac={isMac}>
  {#if app.sidebarOpen}
    <aside class="sidebar">
      <header class="headerbar flat" data-tauri-drag-region>
        <div class="start" data-tauri-drag-region>
          {#if isMac}<span class="traffic-lights" data-tauri-drag-region></span>{/if}
          <button class="btn image flat" use:tooltip={"Open Folder"} onclick={chooseFolder}>
            <Icon name="folder-open" />
          </button>
        </div>
        <div class="center" data-tauri-drag-region>
          <div class="window-title heading" data-tauri-drag-region>
            <span data-tauri-drag-region>{app.folder ? basename(app.folder) : "Margin"}</span>
          </div>
        </div>
        <div class="end" data-tauri-drag-region>
          {@render mainMenuButton()}
        </div>
      </header>
      <nav class="tree" aria-label="Files">
        {#if app.folder && app.listings[app.folder]}
          {#each app.listings[app.folder] as entry (entry.path)}
            <TreeNode {entry} depth={0} onOpen={openFile} />
          {:else}
            <div class="status-page compact">
              <h2 class="title-4">Empty Folder</h2>
              <p class="description dim-label">This folder has no files.</p>
            </div>
          {/each}
        {:else}
          <div class="status-page compact">
            <Icon name="folder" class="icon" size={64} />
            <h2 class="title-4">No Folder Open</h2>
            <p class="description dim-label">Open a folder to browse its documents.</p>
            <div class="actions">
              <button class="btn" onclick={chooseFolder}>Open Folder…</button>
            </div>
          </div>
        {/if}
      </nav>
      <section class="terminal-section" aria-label="Terminals">
        <header class="section-header">
          <h2 class="caption-heading dim-label">Terminals</h2>
          <button
            class="btn image flat section-button"
            use:tooltip={"New Terminal"}
            onclick={() => terminals.create()}
          >
            <Icon name="tab-new" />
          </button>
        </header>
        {#each terminals.sessions as session (session.id)}
          <div
            class="terminal-row"
            class:current={terminals.panelOpen && session.id === terminals.activeId}
            role="button"
            tabindex="0"
            title={session.name}
            onclick={() => terminals.show(session)}
            onkeydown={(e) => e.key === "Enter" && terminals.show(session)}
          >
            <Icon name="utilities-terminal" class="icon" />
            <span class="label">{session.name}</span>
            {#if terminals.sessions.some((s) => s !== session && s.name === session.name)}
              <span class="caption dim-label numeric">{session.number}</span>
            {/if}
            <button
              class="row-close"
              use:tooltip={"Close Terminal"}
              onclick={(e) => {
                e.stopPropagation();
                terminals.close(session);
              }}
            >
              <Icon name="window-close" />
            </button>
          </div>
        {/each}
      </section>
    </aside>
  {/if}

  <main class="content">
    <header class="headerbar" class:with-tabs={app.tabs.length > 0} data-tauri-drag-region>
      <div class="start" data-tauri-drag-region>
        {#if isMac && !app.sidebarOpen}<span class="traffic-lights" data-tauri-drag-region></span>{/if}
        <button
          class="btn image flat"
          class:checked={app.sidebarOpen}
          use:tooltip={app.sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
          onclick={() => (app.sidebarOpen = !app.sidebarOpen)}
        >
          <Icon name="sidebar-show" />
        </button>
        <button class="btn flat" use:tooltip={"Open a Document"} onclick={chooseFiles}>
          <Icon name="document-open" />
          <span>Open</span>
        </button>
        <button class="btn image flat" use:tooltip={"New Tab"} onclick={newFile}>
          <Icon name="tab-new" />
        </button>
      </div>
      <div class="center" data-tauri-drag-region>
        <div class="window-title" data-tauri-drag-region>
          <span class="heading" data-tauri-drag-region>
            {app.active ? `${app.active.dirty ? "• " : ""}${app.active.name}` : "Margin"}
          </span>
          {#if subtitle}<span class="subtitle" data-tauri-drag-region>{subtitle}</span>{/if}
        </div>
      </div>
      <div class="end" data-tauri-drag-region>
        <button
          class="btn image flat"
          use:tooltip={"Print"}
          disabled={!app.active}
          onclick={print}
        >
          <Icon name="printer" />
        </button>
        {#if !app.sidebarOpen}{@render mainMenuButton()}{/if}
        {#if !isMac}<WindowControls />{/if}
      </div>
    </header>

    {#if app.tabs.length > 0}
      <div class="tabbar" role="tablist" data-tauri-drag-region>
        {#each app.tabs as tab (tab.id)}
          <div
            class="tab"
            class:selected={tab.id === app.activeId}
            role="tab"
            tabindex="0"
            aria-selected={tab.id === app.activeId}
            title={tab.path ?? "Unsaved document"}
            onclick={() => (app.activeId = tab.id)}
            onkeydown={(e) => e.key === "Enter" && (app.activeId = tab.id)}
            onauxclick={(e) => e.button === 1 && closeTab(tab)}
            oncontextmenu={(e) => openTabMenu(e, tab)}
          >
            <span class="indicator" aria-label={tab.dirty ? "Unsaved changes" : undefined}>
              {#if tab.dirty}<Icon name="dot" />{/if}
            </span>
            <span class="tab-title">{tab.name}</span>
            <button
              class="tab-close"
              use:tooltip={"Close Tab"}
              onclick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
            >
              <Icon name="window-close" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="editors">
      {#each app.tabs as tab (tab.id)}
        <Editor {tab} active={tab.id === app.activeId} onLink={followLink} />
      {/each}
      {#if app.tabs.length === 0}
        <div class="status-page">
          <Icon name="text-x-generic" class="icon" size={128} />
          <h1 class="title-1">No Open Documents</h1>
          <p class="description dim-label">
            Open a file or start a new markdown document. You can also drop files or a folder here.
          </p>
          <div class="actions">
            <button class="btn pill" onclick={newFile}>New Document</button>
            <button class="btn pill suggested-action" onclick={chooseFiles}>Open File…</button>
          </div>
        </div>
      {/if}
    </div>

    {#if terminals.sessions.length > 0}
      <section
        class="terminal-area"
        class:hidden={!terminals.panelOpen}
        style:height="{terminals.panelHeight}px"
        aria-label="Terminal"
      >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="splitter" onpointerdown={startTerminalResize}></div>
        <header class="panel-header">
          <Icon name="utilities-terminal" />
          <span class="panel-title">{terminals.active?.name ?? ""}</span>
          <button
            class="btn image flat"
            use:tooltip={"New Terminal"}
            onclick={() => terminals.create()}
          >
            <Icon name="tab-new" />
          </button>
          <button
            class="btn image flat"
            use:tooltip={"Close Terminal"}
            onclick={() => terminals.active && terminals.close(terminals.active)}
          >
            <Icon name="window-close" />
          </button>
          <button
            class="btn image flat"
            use:tooltip={"Hide Terminal Area"}
            onclick={() => (terminals.panelOpen = false)}
          >
            <Icon name="pan-down" />
          </button>
        </header>
        <div class="terminal-stack">
          {#each terminals.sessions as session (session.id)}
            <TerminalView
              {session}
              visible={terminals.panelOpen && session.id === terminals.activeId}
              cwd={app.folder}
            />
          {/each}
        </div>
      </section>
    {/if}
  </main>
</div>

{#if menu}
  <Menu sections={menu.sections} anchor={menu.anchor} onclose={() => (menu = null)} />
{/if}
<OverlayHost />

<style>
  .window {
    display: flex;
    height: 100vh;
  }

  /* ---------- Sidebar (AdwNavigationSplitView) ---------- */

  .sidebar {
    flex: none;
    display: flex;
    flex-direction: column;
    width: clamp(220px, 25%, 300px);
    background: var(--sidebar-bg-color);
    color: var(--sidebar-fg-color);
    box-shadow: inset -1px 0 var(--sidebar-border-color);
  }
  .backdrop .sidebar {
    background: var(--sidebar-backdrop-color);
  }
  .tree {
    flex: 1;
    overflow: auto;
    padding: 0 6px 12px 6px;
  }
  /* Terminals: pinned to the bottom of the sidebar, under the file tree. */
  .terminal-section {
    flex: none;
    max-height: 40%;
    overflow-y: auto;
    padding: 0 6px 6px;
    box-shadow: inset 0 1px var(--sidebar-border-color);
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 40px;
    padding: 0 0 0 10px;
  }
  .section-header h2 {
    margin: 0;
  }
  .section-button {
    min-width: 28px;
    min-height: 28px;
  }
  .terminal-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    margin: 1px 0;
    padding: 0 4px 0 10px;
    border-radius: 6px;
  }
  .terminal-row:hover {
    background: var(--hover-color);
  }
  .terminal-row.current {
    background: var(--selected-color);
  }
  .terminal-row .label {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .terminal-row :global(.icon) {
    flex: none;
  }
  .row-close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 9999px;
    background: none;
    opacity: 0;
  }
  .row-close :global(svg) {
    width: 14px;
    height: 14px;
  }
  .terminal-row:hover .row-close,
  .row-close:focus-visible {
    opacity: 1;
  }
  .row-close:hover {
    background: var(--hover-color);
  }

  .traffic-lights {
    flex: none;
    width: 66px;
  }

  /* ---------- Content ---------- */

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--view-bg-color);
    color: var(--view-fg-color);
  }
  .backdrop .content > .headerbar,
  .backdrop .tabbar {
    background: var(--headerbar-backdrop-color);
  }
  .backdrop .headerbar > * {
    opacity: 0.6;
    transition: opacity 200ms;
  }
  .headerbar.with-tabs {
    box-shadow: none;
  }

  /* ---------- Tab bar (AdwTabBar) ---------- */

  .tabbar {
    position: relative;
    z-index: 1;
    flex: none;
    display: flex;
    gap: 6px;
    padding: 0 6px 6px;
    overflow-x: auto;
    scrollbar-width: none;
    background: var(--headerbar-bg-color);
    color: var(--headerbar-fg-color);
    box-shadow: 0 1px var(--headerbar-shade-color);
  }
  .tab {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 120px;
    min-height: 34px;
    padding: 0 5px;
    border-radius: 6px;
    transition: background-color 150ms;
  }
  .tab:hover {
    background: var(--hover-color);
  }
  .tab.selected {
    background: var(--selected-color);
  }
  .tab.selected:hover {
    background: color-mix(in srgb, currentColor 13%, transparent);
  }
  .indicator {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: var(--accent-color);
  }
  .tab-title {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }
  .tab-close {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 9999px;
    background: none;
    opacity: 0;
    transition: opacity 150ms;
  }
  .tab-close :global(svg) {
    width: 14px;
    height: 14px;
  }
  .tab:hover .tab-close,
  .tab.selected .tab-close,
  .tab-close:focus-visible {
    opacity: 1;
  }
  .tab-close:hover {
    background: var(--hover-color);
  }
  .tab-close:active {
    background: var(--active-color);
  }

  .editors {
    flex: 1;
    position: relative;
    min-height: 0;
  }

  /* ---------- Terminal area: the bottom part of the split ---------- */

  .terminal-area {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    box-shadow: 0 -1px var(--headerbar-shade-color);
  }
  .terminal-area.hidden {
    display: none;
  }
  .splitter {
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    z-index: 2;
    height: 8px;
    cursor: row-resize;
  }
  .panel-header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 3px 6px 3px 14px;
  }
  .panel-header > :global(svg) {
    flex: none;
    opacity: var(--dim-opacity);
  }
  .panel-title {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 700;
  }
  .terminal-stack {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .status-page :global(.icon) {
    stroke-width: 0.6;
  }
  .status-page h1,
  .status-page h2 {
    margin: 0;
  }

  @media print {
    .sidebar,
    .headerbar,
    .tabbar,
    .terminal-area,
    .status-page {
      display: none !important;
    }
    .window,
    .content,
    .editors {
      display: block;
      height: auto;
    }
  }
</style>
