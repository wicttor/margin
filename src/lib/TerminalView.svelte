<script lang="ts" module>
  import type { ITheme } from "@xterm/xterm";

  /** GNOME Terminal's palette, on the libadwaita view colors. */
  const ansi = {
    black: "#241f31",
    red: "#c01c28",
    green: "#2ec27e",
    yellow: "#f5c211",
    blue: "#1e78e4",
    magenta: "#9841bb",
    cyan: "#0ab9dc",
    white: "#c0bfbc",
    brightBlack: "#5e5c64",
    brightRed: "#ed333b",
    brightGreen: "#57e389",
    brightYellow: "#f8e45c",
    brightBlue: "#51a1ff",
    brightMagenta: "#c061cb",
    brightCyan: "#4fd2fd",
    brightWhite: "#f6f5f4",
  };
  const themes: Record<"light" | "dark", ITheme> = {
    light: {
      ...ansi,
      background: "#ffffff",
      foreground: "#323235",
      cursor: "#323235",
      cursorAccent: "#ffffff",
      selectionBackground: "#3584e440",
    },
    dark: {
      ...ansi,
      background: "#1d1d20",
      foreground: "#ffffff",
      cursor: "#ffffff",
      cursorAccent: "#1d1d20",
      selectionBackground: "#3584e466",
    },
  };
</script>

<script lang="ts">
  import { onMount } from "svelte";
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

  onMount(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    term = new Terminal({
      fontFamily: '"Adwaita Mono", "Source Code Pro", "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: themes[dark.matches ? "dark" : "light"],
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((event, uri) => (event.ctrlKey || event.metaKey) && void openUrl(uri)));
    term.attachCustomKeyEventHandler(onKey);
    term.open(host);
    refit();

    const onScheme = () => term && (term.options.theme = themes[dark.matches ? "dark" : "light"]);
    dark.addEventListener("change", onScheme);
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

    terminalSpawn(cwd, term.cols, term.rows, output).then(
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
      dark.removeEventListener("change", onScheme);
      term?.dispose();
      term = null;
    };
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

<div class="terminal-view" class:visible bind:this={host}></div>

<style>
  .terminal-view {
    position: absolute;
    inset: 4px 0 0 12px;
    visibility: hidden;
  }
  .terminal-view.visible {
    visibility: visible;
  }
  .terminal-view :global(.xterm-viewport) {
    background-color: transparent !important;
  }
</style>
