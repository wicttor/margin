<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  import { Channel } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
  import {
    terminalResize,
    terminalSpawn,
    terminalWrite,
    type TerminalMessage,
  } from "./api";
  import { terminals, type TerminalSession } from "./terminals.svelte";
  import { prefs, splitArgs } from "./settings.svelte";
  import { terminalTheme } from "./terminalThemes";
  import { overlays } from "./ui/overlays.svelte";
  import { isMac } from "./ui/platform";

  let {
    session,
    visible,
    cwd,
  }: { session: TerminalSession; visible: boolean; cwd: string | null } = $props();

  let host: HTMLDivElement;
  let term: Terminal | null = null;
  let fit: FitAddon | null = null;

  function refit() {
    if (!visible || !fit || !term) return;
    try {
      fit.fit();
    } catch {
      // Not laid out yet.
    }
  }

  /** Copy and paste as in GNOME Console: Ctrl+Shift+C / Ctrl+Shift+V (⌘C / ⌘V on macOS). */
  function onKey(e: KeyboardEvent): boolean {
    if (e.type !== "keydown" || !term) return true;
    const clipboardMod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey;
    const key = e.key.toLowerCase();
    if (clipboardMod && key === "c") {
      const selection = term.getSelection();
      if (selection) void writeText(selection);
      return false;
    }
    if (clipboardMod && key === "v") {
      void readText().then((text) => text && term?.paste(text), () => {});
      return false;
    }
    return true;
  }

  let theme = $derived(
    terminalTheme(prefs.values.terminalColors, prefs.scheme, prefs.values.colorVision),
  );

  /** Terminal options that follow the preferences, live. */
  function options() {
    const v = prefs.values;
    return {
      fontFamily: prefs.monoFamily,
      fontSize: Math.round(14 * prefs.docScale),
      cursorStyle: v.cursorStyle,
      cursorBlink: v.cursorBlink,
      scrollback: Math.max(100, v.scrollback),
      theme,
    };
  }

  onMount(() => {
    term = new Terminal({
      ...options(),
      lineHeight: 1.15,
      allowProposedApi: true,
      macOptionIsMeta: true,
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((event, uri) => (event.ctrlKey || event.metaKey) && void openUrl(uri)));
    term.attachCustomKeyEventHandler(onKey);
    term.open(host);
    refit();

    term.onSelectionChange(() => {
      const selection = term?.getSelection();
      if (prefs.values.copyOnSelect && selection) void writeText(selection);
    });
    const observer = new ResizeObserver(refit);
    observer.observe(host);

    const output = new Channel<TerminalMessage>((message) => {
      if (message instanceof ArrayBuffer) term?.write(new Uint8Array(message));
      else terminals.remove(session); // The shell exited ("exit", Ctrl+D): close it, as VS Code does.
    });
    term.onData((data) => session.ptyId !== null && void terminalWrite(session.ptyId, data).catch(() => {}));
    term.onResize(({ cols, rows }) => {
      if (session.ptyId !== null) void terminalResize(session.ptyId, cols, rows).catch(() => {});
    });
    term.onTitleChange((title) => (session.title = title));

    const shell = prefs.values.shell.trim() || null;
    const args = shell ? splitArgs(prefs.values.shellArgs) : [];
    terminalSpawn({ cwd, shell, args }, term.cols, term.rows, output).then(
      (id) => {
        session.ptyId = id;
        // The panel may have been resized while the shell was starting.
        if (term) void terminalResize(id, term.cols, term.rows).catch(() => {});
      },
      (e) => {
        overlays.toast(`Could not start a terminal: ${e}`);
        terminals.remove(session);
      },
    );

    return () => {
      observer.disconnect();
      term?.dispose();
      term = null;
    };
  });

  // Apply preference changes to the running terminal.
  $effect(() => {
    const next = options();
    if (!term) return;
    Object.assign(term.options, next);
    untrack(refit);
  });

  $effect(() => {
    if (!visible) return;
    // Wait for layout after being shown, then size and focus.
    requestAnimationFrame(() => {
      refit();
      term?.focus();
    });
  });
</script>

<div
  class="terminal-view"
  class:visible
  style:background={theme.background}
  bind:this={host}
></div>

<style>
  .terminal-view {
    position: absolute;
    inset: 0;
    padding: 4px 0 0 12px;
    visibility: hidden;
  }
  .terminal-view.visible {
    visibility: visible;
  }
  .terminal-view :global(.xterm-viewport) {
    background-color: transparent !important;
  }
</style>
