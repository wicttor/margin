<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { message, open, save } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import {
    basename,
    dirname,
    isMarkdown,
    listDir,
    localLinkTarget,
    MARKDOWN_EXTENSIONS,
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

  const SESSION_KEY = "margin.session";
  const isMac = navigator.userAgent.includes("Mac");
  const mod = isMac ? "⌘" : "Ctrl+";
  const markdownFilter = [{ name: "Markdown", extensions: MARKDOWN_EXTENSIONS }];

  let restored = false;

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
      const tab = new Tab(path, await readFile(path));
      app.tabs.push(tab);
      app.activeId = tab.id;
    } catch (e) {
      await message(`Could not open ${basename(path)}.\n\n${e}`, { kind: "error" });
    }
  }

  async function chooseFiles() {
    const picked = await open({ multiple: true, filters: markdownFilter });
    for (const path of picked ?? []) await openFile(path);
  }

  function newFile() {
    const tab = new Tab(null, "");
    app.tabs.push(tab);
    app.activeId = tab.id;
  }

  async function saveTab(tab: Tab, saveAs = false): Promise<boolean> {
    let path = tab.path;
    if (!path || saveAs) {
      const picked = await save({
        filters: markdownFilter,
        defaultPath: path ?? (app.folder ? `${app.folder}/${tab.name}.md` : `${tab.name}.md`),
      });
      if (!picked) return false;
      path = isMarkdown(picked) ? picked : `${picked}.md`;
    }
    try {
      await writeFile(path, tab.content);
    } catch (e) {
      await message(`Could not save ${basename(path)}.\n\n${e}`, { kind: "error" });
      return false;
    }
    tab.path = path;
    tab.markSaved();
    return true;
  }

  /** Asks about unsaved changes. Returns false if the user cancelled. */
  async function confirmDiscard(tab: Tab): Promise<boolean> {
    if (!tab.dirty) return true;
    app.activeId = tab.id;
    const answer = await message(`Do you want to save the changes you made to ${tab.name}?`, {
      title: "Unsaved changes",
      kind: "warning",
      buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
    });
    if (answer === "Save" || answer === "Yes") return saveTab(tab);
    return answer === "Don't Save" || answer === "No";
  }

  async function closeTab(tab: Tab) {
    if (!(await confirmDiscard(tab))) return;
    const index = app.tabs.indexOf(tab);
    app.tabs.splice(index, 1);
    if (app.activeId === tab.id) {
      app.activeId = (app.tabs[index] ?? app.tabs[index - 1])?.id ?? null;
    }
  }

  function cycleTab(step: number) {
    if (app.tabs.length < 2 || !app.active) return;
    const index = app.tabs.indexOf(app.active);
    app.activeId = app.tabs[(index + step + app.tabs.length) % app.tabs.length].id;
  }

  function toggleSource() {
    const tab = app.active;
    if (tab) tab.mode = tab.mode === "source" ? "wysiwyg" : "source";
  }

  async function followLink(href: string, tab: Tab) {
    const target = localLinkTarget(href, tab.path);
    if (target === null) {
      if (!href.startsWith("#")) await openUrl(href).catch(() => {});
      return;
    }
    if (isMarkdown(target)) await openFile(target);
    else await openUrl(href.startsWith("file:") ? href : `file://${target}`).catch(() => {});
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
        const text = await readFile(tab.path);
        if (text !== tab.diskText) tab.reload(text);
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
      sidebarWidth: app.sidebarWidth,
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
      app.sidebarWidth = session.sidebarWidth ?? 260;
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
    const title = tab ? `${tab.dirty ? "● " : ""}${tab.name} — Margin` : "Margin";
    getCurrentWindow().setTitle(title).catch(() => {});
  });

  // ---------- shortcuts ----------

  function onKeydown(e: KeyboardEvent) {
    const cmd = isMac ? e.metaKey : e.ctrlKey;
    if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
      return;
    }
    if (!cmd || e.altKey) return;
    const key = e.key.toLowerCase();
    const actions: Record<string, () => unknown> = {
      s: () => app.active && saveTab(app.active, e.shiftKey),
      o: () => (e.shiftKey ? chooseFolder() : chooseFiles()),
      n: () => !e.shiftKey && newFile(),
      w: () => app.active && closeTab(app.active),
      p: () => printPage(),
      "/": () => toggleSource(),
      l: () => e.shiftKey && (app.sidebarOpen = !app.sidebarOpen),
    };
    const action = actions[key];
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  }

  // ---------- sidebar resize ----------

  function startResize(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      app.sidebarWidth = Math.min(520, Math.max(180, ev.clientX));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  onMount(() => {
    const cleanups: Promise<() => void>[] = [
      listen<string[]>("fs-change", (e) => onFsChange(e.payload)),
      listen("open-files", openPending),
      getCurrentWebview().onDragDropEvent(async (e) => {
        if (e.payload.type !== "drop") return;
        for (const path of e.payload.paths) {
          if (isMarkdown(path)) await openFile(path);
          else if (await listDir(path).then(() => true, () => false)) await setFolder(path);
        }
      }),
      getCurrentWindow().onCloseRequested(async (e) => {
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

<svelte:window onkeydowncapture={onKeydown} />

<div class="app">
  {#if app.sidebarOpen}
    <aside class="sidebar" style:width="{app.sidebarWidth}px">
      <header class="sidebar-header">
        <span class="folder-name" title={app.folder ?? ""}>
          {app.folder ? basename(app.folder) : "No folder"}
        </span>
        <button class="icon-button" title="Open folder ({mod}Shift+O)" onclick={chooseFolder}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </header>
      <nav class="tree">
        {#if app.folder && app.listings[app.folder]}
          {#each app.listings[app.folder] as entry (entry.path)}
            <TreeNode {entry} depth={0} onOpen={openFile} />
          {:else}
            <p class="hint">No markdown files in this folder.</p>
          {/each}
        {:else}
          <div class="hint">
            <p>Open a folder to browse its markdown files.</p>
            <button class="button" onclick={chooseFolder}>Open folder…</button>
          </div>
        {/if}
      </nav>
    </aside>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resizer" onpointerdown={startResize}></div>
  {/if}

  <main class="main">
    <div class="tabbar">
      <button
        class="icon-button"
        title="Toggle sidebar ({mod}Shift+L)"
        onclick={() => (app.sidebarOpen = !app.sidebarOpen)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
          <path d="M6 2.5v11" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </button>
      <div class="tabs" role="tablist">
        {#each app.tabs as tab (tab.id)}
          <div
            class="tab"
            class:active={tab.id === app.activeId}
            role="tab"
            tabindex="0"
            aria-selected={tab.id === app.activeId}
            title={tab.path ?? "Unsaved document"}
            onclick={() => (app.activeId = tab.id)}
            onkeydown={(e) => e.key === "Enter" && (app.activeId = tab.id)}
            onauxclick={(e) => e.button === 1 && closeTab(tab)}
          >
            <span class="tab-name">{tab.name}</span>
            <button
              class="tab-close"
              class:dirty={tab.dirty}
              title="Close ({mod}W)"
              onclick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
            >
              <span class="dot"></span>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.4" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
      <button
        class="icon-button"
        title="Print ({mod}P)"
        disabled={!app.active}
        onclick={() => printPage()}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4.5 6V1.5h7V6M4.5 11.5h-3v-5.5h13v5.5h-3M4.5 9.5h7v5h-7z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div class="editors">
      {#each app.tabs as tab (tab.id)}
        <Editor {tab} active={tab.id === app.activeId} onLink={followLink} />
      {/each}
      {#if app.tabs.length === 0}
        <div class="welcome">
          <h1>Margin</h1>
          <dl>
            <dt>New file</dt><dd>{mod}N</dd>
            <dt>Open file</dt><dd>{mod}O</dd>
            <dt>Open folder</dt><dd>{mod}Shift+O</dd>
            <dt>Save / Save as</dt><dd>{mod}S / {mod}Shift+S</dd>
            <dt>Source mode</dt><dd>{mod}/</dd>
            <dt>Print</dt><dd>{mod}P</dd>
          </dl>
          <p>You can also drop markdown files or a folder on this window.</p>
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  .app {
    display: flex;
    height: 100vh;
  }
  .sidebar {
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--sidebar);
    min-width: 0;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 8px 0 14px;
  }
  .folder-name {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tree {
    flex: 1;
    overflow: auto;
    padding: 2px 6px 12px;
  }
  .hint {
    padding: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .hint p {
    margin: 0 0 10px;
  }
  .resizer {
    flex: none;
    width: 4px;
    margin-left: -2px;
    margin-right: -2px;
    cursor: col-resize;
    position: relative;
    z-index: 1;
    border-left: 1px solid var(--border);
    background-clip: content-box;
  }
  .resizer:hover {
    background: var(--accent);
  }
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tabbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px;
    border-bottom: 1px solid var(--border);
  }
  .tabs {
    flex: 1;
    display: flex;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 220px;
    min-width: 90px;
    height: 30px;
    padding: 0 4px 0 12px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--muted);
    cursor: default;
    user-select: none;
  }
  .tab:hover {
    background: var(--hover);
  }
  .tab.active {
    background: var(--selected);
    color: var(--text);
  }
  .tab-name {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .tab-close {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
  }
  .tab-close > * {
    grid-area: 1 / 1;
  }
  .tab-close svg {
    width: 14px;
    height: 14px;
    opacity: 0;
  }
  .tab:hover .tab-close svg,
  .tab.active .tab-close:not(.dirty) svg {
    opacity: 1;
  }
  .tab-close:hover {
    background: var(--hover-strong);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    visibility: hidden;
  }
  .tab-close.dirty .dot {
    visibility: visible;
  }
  .tab:hover .tab-close.dirty .dot {
    visibility: hidden;
  }
  .editors {
    flex: 1;
    position: relative;
    min-height: 0;
  }
  .welcome {
    max-width: 360px;
    margin: 12vh auto 0;
    padding: 0 24px;
    color: var(--muted);
    font-size: 13px;
  }
  .welcome h1 {
    margin: 0 0 20px;
    font-size: 22px;
    font-weight: 600;
    color: var(--text);
  }
  .welcome dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 16px;
    margin: 0 0 20px;
  }
  .welcome dt,
  .welcome dd {
    margin: 0;
  }
  .welcome dd {
    font-family: var(--font-mono);
    color: var(--text);
  }

  @media print {
    .sidebar,
    .resizer,
    .tabbar,
    .welcome {
      display: none !important;
    }
    .app,
    .main,
    .editors {
      display: block;
      height: auto;
    }
  }
</style>
