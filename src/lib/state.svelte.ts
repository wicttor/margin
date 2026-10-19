import { SvelteSet } from "svelte/reactivity";
import { basename, listDir, type Entry } from "./api";

export type Mode = "wysiwyg" | "source";

let nextTabId = 1;

export class Tab {
  readonly id = nextTabId++;
  path = $state<string | null>(null);
  /** The markdown as currently edited. */
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

  name = $derived(this.path ? basename(this.path) : "Untitled");
  dirty = $derived(this.content !== this.diskText && this.content !== this.baseline);

  constructor(path: string | null, text: string) {
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
