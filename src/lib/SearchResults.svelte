<script lang="ts">
  import { tick } from "svelte";
  import { app } from "./state.svelte";
  import { prefs } from "./settings.svelte";
  import Icon from "./ui/Icon.svelte";

  /** The file search results, shown in place of the tree. */
  let { onOpen }: { onOpen: (path: string) => void } = $props();

  let rows: HTMLElement[] = $state([]);

  let terms = $derived(app.searchQuery.trim().split(/\s+/).filter(Boolean));

  /** A name split into the parts that match the search words (shown bold) and the rest. */
  function parts(name: string): { text: string; match: boolean }[] {
    if (terms.length === 0) return [{ text: name, match: false }];
    const pattern = new RegExp(
      `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "gi",
    );
    // Splitting on a capturing pattern alternates rest, match, rest, match…, so the
    // parity has to be read before dropping the empty pieces.
    return name
      .split(pattern)
      .map((text, i) => ({ text, match: i % 2 === 1 }))
      .filter((part) => part.text !== "");
  }

  // Keep the highlighted result in view while moving through the list with the arrow keys.
  $effect(() => {
    const active = app.searchActive;
    void tick().then(() => rows[active]?.scrollIntoView({ block: "nearest" }));
  });
</script>

{#if app.searchResults.length > 0}
  <ul class="results" aria-label="Search results">
    {#each app.searchResults as hit, i (hit.path)}
      <li>
        <button
          class="row"
          class:selected={i === app.searchActive}
          title={hit.path}
          bind:this={rows[i]}
          onclick={() => {
            app.searchActive = i;
            app.treeSelected = hit.path;
            if (prefs.values.openWith === "single") onOpen(hit.path);
          }}
          ondblclick={() => prefs.values.openWith === "double" && onOpen(hit.path)}
        >
          <Icon name="text-x-generic" class="icon" />
          <span class="text">
            <span class="name">
              {#each parts(hit.name) as part}{#if part.match}<b>{part.text}</b>{:else}{part.text}{/if}{/each}
            </span>
            {#if hit.dir}<span class="dir caption dim-label">{hit.dir}</span>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <div class="status-page compact">
    <h2 class="title-4">No Results</h2>
    <p class="description dim-label">No files match “{app.searchQuery.trim()}”.</p>
  </div>
{/if}

<style>
  .results {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--row-height);
    margin: 1px 0;
    padding: 2px 10px 2px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    text-align: start;
  }
  .row:hover {
    background: var(--hover-color);
  }
  .row.selected {
    background: var(--selected-color);
  }
  .row :global(.icon) {
    flex: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name,
  .dir {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  b {
    font-weight: 800;
  }
</style>
