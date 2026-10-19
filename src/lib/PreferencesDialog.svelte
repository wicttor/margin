<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { installedMonospaceFonts, prefs, type Preferences } from "./settings.svelte";
  import { recent } from "./recent.svelte";
  import Icon from "./ui/Icon.svelte";
  import { overlays } from "./ui/overlays.svelte";
  import { isMac } from "./ui/platform";
  import { tooltip } from "./ui/tooltip";

  let { onclose }: { onclose: () => void } = $props();

  const SECTIONS = [
    { id: "appearance", title: "Appearance" },
    { id: "files", title: "Files & Folders" },
    { id: "projects", title: "Projects & History" },
    { id: "markdown", title: "Markdown Editor" },
    { id: "code", title: "Code Editor" },
    { id: "terminal", title: "Terminal" },
    { id: "printing", title: "Printing" },
  ] as const;

  type Option<T> = { value: T; label: string };
  type Key = keyof Preferences;

  let scroller: HTMLDivElement;
  let current = $state<string>(SECTIONS[0].id);
  let monoFonts = $state<string[]>([]);
  let v = $derived(prefs.values);

  onMount(() => {
    monoFonts = installedMonospaceFonts();
  });

  let codeFontOptions = $derived<Option<string>[]>([
    { value: "", label: "System Monospace" },
    ...[...new Set([...monoFonts, ...(v.codeFont ? [v.codeFont] : [])])]
      .sort()
      .map((name) => ({ value: name, label: name })),
  ]);

  function set<K extends Key>(key: K, value: Preferences[K]) {
    prefs.values[key] = value;
  }

  /** Scrolls to a section; the sidebar links act as anchors within the dialog. */
  function go(id: string, event: MouseEvent) {
    event.preventDefault();
    current = id;
    scroller.querySelector(`#prefs-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Highlights the section being read: the last one whose heading has scrolled past the top. */
  function onScroll() {
    const top = scroller.getBoundingClientRect().top + 48;
    let active: string = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const heading = scroller.querySelector(`#prefs-${s.id}`);
      if (heading && heading.getBoundingClientRect().top <= top) active = s.id;
    }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      active = SECTIONS[SECTIONS.length - 1].id;
    }
    current = active;
  }

  async function resetAll() {
    const answer = await overlays.alert({
      heading: "Reset Preferences?",
      body: "All preferences will return to their defaults. Your recent folders and files are kept.",
      responses: [
        { id: "cancel", label: "Cancel" },
        { id: "reset", label: "Reset", appearance: "destructive" },
      ],
      defaultResponse: "cancel",
      closeResponse: "cancel",
    });
    if (answer === "reset") prefs.reset();
  }

  async function clearHistory() {
    const answer = await overlays.alert({
      heading: "Clear History?",
      body: "The lists of recent folders and files will be emptied.",
      responses: [
        { id: "cancel", label: "Cancel" },
        { id: "clear", label: "Clear", appearance: "destructive" },
      ],
      defaultResponse: "cancel",
      closeResponse: "cancel",
    });
    if (answer === "clear") recent.clear();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && overlays.alerts.length === 0) onclose();
  }

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
</script>

<svelte:window onkeydown={onKey} />

{#snippet row(title: string, subtitle: string | undefined, control: Snippet)}
  <div class="row">
    <div class="row-text">
      <span class="row-title">{title}</span>
      {#if subtitle}<span class="row-subtitle caption dim-label">{subtitle}</span>{/if}
    </div>
    <div class="row-control">{@render control()}</div>
  </div>
{/snippet}

{#snippet switchRow(key: Key, title: string, subtitle?: string)}
  {#snippet control()}
    <button
      class="switch"
      role="switch"
      aria-checked={!!v[key]}
      aria-label={title}
      onclick={() => set(key, !v[key] as never)}
    >
      <span class="knob"></span>
    </button>
  {/snippet}
  {@render row(title, subtitle, control)}
{/snippet}

{#snippet selectRow(key: Key, title: string, options: Option<any>[], subtitle?: string)}
  {#snippet control()}
    <select
      class="dropdown"
      aria-label={title}
      value={String(v[key])}
      onchange={(e) => {
        const raw = e.currentTarget.value;
        const option = options.find((o) => String(o.value) === raw);
        if (option) set(key, option.value);
      }}
    >
      {#each options as option}
        <option value={String(option.value)}>{option.label}</option>
      {/each}
    </select>
  {/snippet}
  {@render row(title, subtitle, control)}
{/snippet}

{#snippet toggleRow(key: Key, title: string, options: Option<any>[], subtitle?: string)}
  {#snippet control()}
    <div class="toggle-group" role="radiogroup" aria-label={title}>
      {#each options as option}
        <button
          role="radio"
          aria-checked={v[key] === option.value}
          class:active={v[key] === option.value}
          onclick={() => set(key, option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/snippet}
  {@render row(title, subtitle, control)}
{/snippet}

{#snippet numberRow(key: Key, title: string, min: number, max: number, step: number, unit?: string, subtitle?: string)}
  {#snippet control()}
    <span class="spin">
      <input
        type="number"
        aria-label={title}
        {min}
        {max}
        {step}
        value={v[key] as number}
        onchange={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isFinite(n)) set(key, clamp(Math.round(n), min, max) as never);
          e.currentTarget.value = String(v[key]);
        }}
      />
      {#if unit}<span class="dim-label">{unit}</span>{/if}
    </span>
  {/snippet}
  {@render row(title, subtitle, control)}
{/snippet}

{#snippet textRow(title: string, value: string, placeholder: string, commit: (text: string) => void, subtitle?: string)}
  {#snippet control()}
    <input
      class="entry"
      type="text"
      aria-label={title}
      {placeholder}
      {value}
      spellcheck="false"
      onchange={(e) => commit(e.currentTarget.value)}
      onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  {/snippet}
  {@render row(title, subtitle, control)}
{/snippet}

<div class="dialog-backdrop">
  <div class="dialog preferences" role="dialog" aria-modal="true" aria-label="Preferences">
    <nav class="prefs-sidebar" aria-label="Preference sections">
      <header class="headerbar flat">
        <div class="center"><div class="window-title heading">Preferences</div></div>
      </header>
      <ul>
        {#each SECTIONS as section}
          <li>
            <a
              href="#prefs-{section.id}"
              class:current={current === section.id}
              aria-current={current === section.id ? "true" : undefined}
              onclick={(e) => go(section.id, e)}
            >
              {section.title}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="prefs-main">
      <header class="headerbar flat">
        <div class="start"></div>
        <div class="center">
          <div class="window-title heading">
            {SECTIONS.find((s) => s.id === current)?.title}
          </div>
        </div>
        <div class="end">
          <button class="btn image flat circular close" use:tooltip={"Close"} onclick={onclose}>
            <Icon name="window-close" />
          </button>
        </div>
      </header>

      <div class="prefs-scroll" bind:this={scroller} onscroll={onScroll}>
        <section>
          <h2 id="prefs-appearance" class="title-4">Appearance</h2>
          <div class="boxed-list">
            {@render toggleRow("theme", "Theme", [
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ])}
            {@render toggleRow("density", "Spacing", [
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ], "Compact reduces padding and margins")}
            {@render toggleRow("uiTextSize", "Interface text size", [
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ])}
            {@render toggleRow("docTextSize", "Document text size", [
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ], "Also used for code and terminals")}
            {@render selectRow("documentFont", "Document font", [
              { value: "sans", label: "Sans (Inter)" },
              { value: "serif", label: "Serif" },
              { value: "system", label: "System Font" },
            ], "For markdown documents")}
            {@render selectRow("codeFont", "Code font", codeFontOptions, "For code, markdown source and terminals")}
            {@render selectRow("colorVision", "Color vision", [
              { value: "default", label: "Default" },
              { value: "red-green", label: "Red–green (protanopia, deuteranopia)" },
              { value: "blue-yellow", label: "Blue–yellow (tritanopia)" },
            ], "Adjusts colors across the app, including terminals")}
          </div>
        </section>

        <section>
          <h2 id="prefs-files" class="title-4">Files & Folders</h2>
          <div class="boxed-list">
            {@render toggleRow("openWith", "Open files in the tree with", [
              { value: "double", label: "Double-click" },
              { value: "single", label: "Single click" },
            ])}
            {@render switchRow("showHidden", "Show hidden files", "Files and folders whose names start with a dot")}
            {@render textRow(
              "Folders to hide",
              v.hiddenFolders.join(", "),
              "node_modules, __pycache__",
              (text) => set("hiddenFolders", text.split(",").map((s) => s.trim()).filter(Boolean)),
              "Separated by commas",
            )}
            {@render numberRow("externalSizeMB", "Open in the default app above", 1, 1000, 1, "MB", "Larger files open in another app instead of the editor")}
            {@render switchRow("autoReload", "Reload files changed by other apps", "Only files without unsaved changes")}
          </div>
        </section>

        <section>
          <h2 id="prefs-projects" class="title-4">Projects & History</h2>
          <div class="boxed-list">
            {@render switchRow("closeOnSwitch", "Close documents when opening another folder")}
            {@render switchRow("restoreProjectFiles", "Reopen a project's files when opening it")}
            {@render switchRow("restoreLastProject", "Reopen the last project on startup")}
            {@render numberRow("recentFolders", "Recent folders to remember", 1, 50, 1)}
            {@render numberRow("recentFiles", "Recent files to remember", 1, 100, 1)}
            {#snippet clearButton()}
              <button class="btn" onclick={clearHistory}>Clear History</button>
            {/snippet}
            {@render row("Recent folders and files", "Shown in Open Recent and on the empty window", clearButton)}
          </div>
        </section>

        <section>
          <h2 id="prefs-markdown" class="title-4">Markdown Editor</h2>
          <div class="boxed-list">
            {@render toggleRow("markdownMode", "Open markdown files as", [
              { value: "wysiwyg", label: "Rendered" },
              { value: "source", label: "Source" },
            ])}
            {@render toggleRow("bullet", "Bullet character when saving", [
              { value: "-", label: "-" },
              { value: "*", label: "*" },
              { value: "+", label: "+" },
            ])}
            {@render textRow(
              "Folder for pasted images",
              v.imagesFolder,
              "assets",
              (text) => set("imagesFolder", text.trim().replace(/[\\/]/g, "") || "assets"),
              "Created next to the document",
            )}
            {@render toggleRow("linkClick", "Open links with", [
              { value: "ctrl", label: isMac ? "⌘+Click" : "Ctrl+Click" },
              { value: "click", label: "Click" },
            ])}
          </div>
        </section>

        <section>
          <h2 id="prefs-code" class="title-4">Code Editor</h2>
          <div class="boxed-list">
            {@render switchRow("lineNumbers", "Line numbers")}
            {@render switchRow("wrapLines", "Wrap long lines")}
            {@render toggleRow("tabWidth", "Tab width", [
              { value: 2, label: "2" },
              { value: 4, label: "4" },
              { value: 8, label: "8" },
            ])}
            {@render switchRow("highlightLine", "Highlight the current line")}
          </div>
        </section>

        <section>
          <h2 id="prefs-terminal" class="title-4">Terminal</h2>
          <div class="boxed-list">
            {@render textRow(
              "Shell",
              v.shell,
              "System default",
              (text) => set("shell", text.trim()),
              "A program such as bash, zsh or pwsh; empty uses the default",
            )}
            {@render textRow("Shell arguments", v.shellArgs, "None", (text) => set("shellArgs", text), "Used with a custom shell")}
            {@render toggleRow("terminalStart", "Start in", [
              { value: "folder", label: "Open Folder" },
              { value: "home", label: "Home Folder" },
            ])}
            {@render selectRow("terminalColors", "Colors", [
              { value: "app", label: "Follow App Theme" },
              { value: "github-light", label: "GitHub Light" },
              { value: "github-dark", label: "GitHub Dark" },
              { value: "github-colorblind-light", label: "GitHub Light Colorblind" },
              { value: "github-colorblind-dark", label: "GitHub Dark Colorblind" },
              { value: "github-tritanopia-light", label: "GitHub Light Tritanopia" },
              { value: "github-tritanopia-dark", label: "GitHub Dark Tritanopia" },
            ], "Changes to the shell apply to new terminals")}
            {@render toggleRow("cursorStyle", "Cursor", [
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Underline" },
            ])}
            {@render switchRow("cursorBlink", "Blinking cursor")}
            {@render numberRow("scrollback", "Scrollback", 100, 100000, 1000, "lines")}
            {@render switchRow("copyOnSelect", "Copy text when selected")}
          </div>
        </section>

        <section>
          <h2 id="prefs-printing" class="title-4">Printing</h2>
          <div class="boxed-list">
            {@render toggleRow("printMargins", "Page margins", [
              { value: "narrow", label: "Narrow" },
              { value: "normal", label: "Normal" },
              { value: "wide", label: "Wide" },
            ])}
            {@render switchRow("printLineNumbers", "Print code with line numbers")}
          </div>
        </section>

        <div class="reset">
          <button class="btn" onclick={resetAll}>Reset to Defaults</button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .preferences {
    flex-direction: row;
    width: min(880px, 100%);
    height: min(680px, 100%);
  }

  /* ---------- Sidebar with section links ---------- */

  .prefs-sidebar {
    flex: none;
    display: flex;
    flex-direction: column;
    width: 220px;
    background: var(--sidebar-bg-color);
    color: var(--sidebar-fg-color);
    box-shadow: inset -1px 0 var(--sidebar-border-color);
  }
  .prefs-sidebar ul {
    margin: 0;
    padding: 0 6px 12px;
    list-style: none;
    overflow-y: auto;
  }
  .prefs-sidebar a {
    display: flex;
    align-items: center;
    min-height: var(--row-height);
    margin: 1px 0;
    padding: 0 12px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }
  .prefs-sidebar a:hover {
    background: var(--hover-color);
  }
  .prefs-sidebar a.current {
    background: var(--selected-color);
    font-weight: 700;
  }

  /* ---------- Content ---------- */

  .prefs-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .close {
    min-width: 24px;
    min-height: 24px;
    width: 24px;
    height: 24px;
    margin-right: 6px;
  }
  .close :global(svg) {
    width: 14px;
    height: 14px;
  }
  .prefs-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 6px 30px 30px;
  }
  section + section {
    margin-top: 30px;
  }
  section h2 {
    margin: 0 0 10px;
    scroll-margin-top: 12px;
  }

  .row {
    gap: 18px !important;
  }
  .row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .row-control {
    flex: none;
    display: flex;
    align-items: center;
  }

  /* GtkSwitch */
  .switch {
    position: relative;
    width: 48px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 9999px;
    background: color-mix(in srgb, currentColor 15%, transparent);
    transition: background-color 150ms;
  }
  .switch[aria-checked="true"] {
    background: var(--accent-bg-color);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
    transition: transform 150ms;
  }
  .switch[aria-checked="true"] .knob {
    transform: translateX(22px);
  }

  /* AdwToggleGroup */
  .toggle-group {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .toggle-group button {
    min-height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: none;
    white-space: nowrap;
  }
  .toggle-group button:hover:not(.active) {
    background: var(--hover-color);
  }
  .toggle-group button.active {
    background: var(--view-bg-color);
    box-shadow: 0 1px 3px rgb(0 0 0 / 15%);
    font-weight: 700;
  }
  :global(:root[data-scheme="dark"]) .toggle-group button.active {
    background: rgb(255 255 255 / 15%);
  }

  /* Dropdowns, entries and spin buttons */
  .dropdown,
  .entry,
  .spin input {
    min-height: 34px;
    border: 0;
    border-radius: 6px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: inherit;
    font: inherit;
  }
  .dropdown {
    max-width: 260px;
    padding: 0 8px;
  }
  .dropdown option {
    background: var(--popover-bg-color);
    color: var(--popover-fg-color);
  }
  .entry {
    width: 240px;
    padding: 0 10px;
  }
  .spin {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .spin input {
    width: 96px;
    padding: 0 8px;
    font-feature-settings: "tnum";
  }
  .dropdown:focus-visible,
  .entry:focus,
  .spin input:focus {
    outline: 2px solid var(--focus-ring-color);
    outline-offset: -2px;
  }

  .reset {
    display: flex;
    justify-content: center;
    margin-top: 30px;
  }

  @media (max-width: 720px) {
    .prefs-sidebar {
      display: none;
    }
  }
</style>
