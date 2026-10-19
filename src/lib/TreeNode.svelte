<script lang="ts">
  import type { Entry } from "./api";
  import { app } from "./state.svelte";
  import Self from "./TreeNode.svelte";
  import Icon from "./ui/Icon.svelte";

  let { entry, depth, onOpen }: { entry: Entry; depth: number; onOpen: (path: string) => void } =
    $props();

  let open = $derived(app.expanded.has(entry.path));
  let children = $derived(app.listings[entry.path]);
  let current = $derived(app.active?.path === entry.path);

  async function toggle() {
    if (open) {
      app.expanded.delete(entry.path);
    } else {
      app.expanded.add(entry.path);
      if (!children) await app.loadListing(entry.path);
    }
  }
</script>

<button
  class="row"
  class:current
  style:padding-inline-start="{6 + depth * 18}px"
  title={entry.path}
  aria-expanded={entry.is_dir ? open : undefined}
  onclick={() => (entry.is_dir ? toggle() : onOpen(entry.path))}
>
  {#if entry.is_dir}
    <span class="expander" class:open><Icon name="go-next" /></span>
    <Icon name={open ? "folder-open" : "folder"} class="icon" />
  {:else}
    <span class="expander"></span>
    <Icon name="text-x-generic" class="icon" />
  {/if}
  <span class="label">{entry.name}</span>
</button>

{#if entry.is_dir && open && children}
  {#each children as child (child.path)}
    <Self entry={child} depth={depth + 1} {onOpen} />
  {/each}
  {#if children.length === 0}
    <div class="empty dim-label" style:padding-inline-start="{6 + (depth + 1) * 18 + 22}px">No markdown files</div>
  {/if}
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 34px;
    margin: 1px 0;
    padding-inline-end: 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    text-align: start;
  }
  .row:hover {
    background: var(--hover-color);
  }
  .row:active {
    background: var(--active-color);
  }
  .row.current {
    background: var(--selected-color);
  }
  .expander {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    opacity: var(--dim-opacity);
    transition: transform 150ms ease-out;
  }
  .expander :global(svg) {
    width: 12px;
    height: 12px;
  }
  .expander.open {
    transform: rotate(90deg);
  }
  .row :global(.icon) {
    flex: none;
  }
  .label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .empty {
    min-height: 30px;
    line-height: 30px;
    font-size: 9pt;
  }
</style>
