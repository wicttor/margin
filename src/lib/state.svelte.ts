import { SvelteSet } from "svelte/reactivity";
import { basename, listDir, type Entry } from "./api";

export type Mode = "wysiwyg" | "source";
/** Markdown opens in the WYSIWYG editor; any other text file opens in the code editor. */
export type Kind = "markdown" | "code";

let nextTabId = 1;

export class Tab {
  readonly id = nextTabId++;
  path = $state<string | null>(null);
  /** The text as currently edited. */
  content = $state("");
  /** The text last read from or written to disk. */
  diskText = $state("");
  /**
   * The editor's own serialization of `diskText`. The WYSIWYG editor may rewrite
   * markdown it did not change (list markers, escaping), so "dirty" compares against both.
   */
  baseline = $state<string | null>(null);
  /** Bumped when the content is replaced from outside, so the editor rebuilds. */
  version = $state(0);
  mode = $state<Mode>("wysiwyg");
  /**
   * Set by the tab's editor. The WYSIWYG editor reports changes after a short delay, so
   * call this before reading `content` for saving or closing, to include the latest keystrokes.
   */
  flush: (() => void) | null = null;
  /** Set by the tab's editor: prepares the static view that is printed in source mode. */
  preparePrint: (() => void) | null = null;
  readonly kind: Kind;

  name = $derived(this.path ? basename(this.path) : "Untitled");
  dirty = $derived(this.content !== this.diskText && this.content !== this.baseline);

  constructor(path: string | null, text: string, kind: Kind = "markdown") {
    this.kind = kind;
    if (kind === "code") this.mode = "source";
    this.path = path;
    this.content = text;
    this.diskText = text;
  }

  /** Replaces the content with text from disk. */
  reload(text: string) {
    this.content = text;
    this.diskText = text;
    this.baseline = null;
    this.version++;
  }

  markSaved() {
    this.diskText = this.content;
    this.baseline = this.content;
  }
}

class AppState {
  folder = $state<string | null>(null);
  /** Folder path → its listing, for every folder the tree has loaded. */
  listings = $state<Record<string, Entry[]>>({});
  expanded = new SvelteSet<string>();
  /** Files recently opened in the current project, newest first. */
  projectRecent = $state<string[]>([]);
  /** The highlighted row in the file tree: clicked, or the active document. */
  treeSelected = $state<string | null>(null);

  tabs = $state<Tab[]>([]);
  activeId = $state<number | null>(null);
  active = $derived(this.tabs.find((t) => t.id === this.activeId) ?? null);

  sidebarOpen = $state(true);

  async loadListing(dir: string) {
    try {
      this.listings[dir] = await listDir(dir);
    } catch {
      delete this.listings[dir];
      this.expanded.delete(dir);
    }
  }
}

export const app = new AppState();
