<script lang="ts">
  import { searchFiles } from "./api";
  import { app } from "./state.svelte";
  import { prefs } from "./settings.svelte";
  import Icon from "./ui/Icon.svelte";
  import { tooltip } from "./ui/tooltip";

  /** The search box above the file tree (a GtkSearchEntry). */
  let { onOpen }: { onOpen: (path: string) => void } = $props();

  let input: HTMLInputElement;
  /** Increases per search, so a slower, older one can tell it was superseded. */
  let sequence = 0;

  export function focus() {
    input?.focus();
    input?.select();
  }

  // Search as you type, a moment after the last key, and again when the project,
  // the hidden-file preferences or the files on disk change.
  $effect(() => {
    const query = app.searchQuery.trim();
    const folder = app.folder;
    const options = prefs.listOptions;
    void app.changeTick;
    if (!query || !folder) {
      sequence++;
      app.searchResults = [];
      return;
    }
    const timer = setTimeout(async () => {
      const mine = ++sequence;
      try {
        const hits = await searchFiles(folder, query, options);
        if (mine !== sequence) return;
        app.searchResults = hits;
        app.searchActive = Math.min(app.searchActive, Math.max(0, hits.length - 1));
      } catch {
        if (mine === sequence) app.searchResults = [];
      }
    }, 120);
    return () => clearTimeout(timer);
  });

  // A new query starts at the best match.
  let lastQuery = "";
  $effect(() => {
    if (app.searchQuery !== lastQuery) {
      lastQuery = app.searchQuery;
      app.searchActive = 0;
    }
  });

  // A different project starts with an empty search.
  $effect(() => {
    void app.folder;
    app.searchQuery = "";
  });

  function onkeydown(e: KeyboardEvent) {
    const count = app.searchResults.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (count > 0) {
        const step = e.key === "ArrowDown" ? 1 : -1;
        app.searchActive = (app.searchActive + step + count) % count;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = app.searchResults[app.searchActive];
      if (hit) onOpen(hit.path);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (app.searchQuery) app.searchQuery = "";
      else input.blur();
    }
  }
</script>

<div class="search">
  <Icon name="edit-find" class="icon" />
  <input
    bind:this={input}
    bind:value={app.searchQuery}
    type="text"
    role="searchbox"
    placeholder="Search files"
    aria-label="Search files"
    autocomplete="off"
    spellcheck="false"
    {onkeydown}
  />
  {#if app.searchQuery}
    <button
      class="clear"
      use:tooltip={"Clear Search"}
      onclick={() => {
        app.searchQuery = "";
        input.focus();
      }}
    >
      <Icon name="window-close" />
    </button>
  {/if}
</div>

<style>
  .search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--row-height);
    margin: 0 6px 6px;
    padding: 0 4px 0 10px;
    border-radius: 6px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    transition: box-shadow 150ms;
  }
  .search:focus-within {
    box-shadow: inset 0 0 0 2px var(--focus-ring-color);
  }
  .search :global(.icon) {
    flex: none;
    opacity: var(--dim-opacity);
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: calc(var(--row-height) - 2px);
    padding: 0;
    border: 0;
    outline: none;
    background: none;
    color: inherit;
    font: inherit;
    user-select: text;
    cursor: text;
  }
  input::placeholder {
    color: inherit;
    opacity: var(--dim-opacity);
  }
  .clear {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 9999px;
    background: none;
  }
  .clear :global(svg) {
    width: 14px;
    height: 14px;
  }
  .clear:hover {
    background: var(--hover-color);
  }
</style>
