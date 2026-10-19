<script lang="ts">
  import type { Entry } from "./api";
  import { app } from "./state.svelte";
  import Self from "./TreeNode.svelte";

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
  style:padding-left="{8 + depth * 14}px"
  title={entry.path}
  onclick={() => (entry.is_dir ? toggle() : onOpen(entry.path))}
>
  {#if entry.is_dir}
    <svg class="chevron" class:open viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
    </svg>
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
  {:else}
    <span class="chevron"></span>
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
  {/if}
  <span class="label">{entry.is_dir ? entry.name : entry.name.replace(/\.(md|markdown)$/i, "")}</span>
</button>

{#if entry.is_dir && open && children}
  {#each children as child (child.path)}
    <Self entry={child} depth={depth + 1} {onOpen} />
  {/each}
  {#if children.length === 0}
    <div class="empty" style:padding-left="{30 + (depth + 1) * 14}px">No markdown files</div>
  {/if}
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 26px;
    padding-right: 8px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: default;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.current {
    background: var(--selected);
    font-weight: 500;
  }
  .chevron {
    flex: none;
    width: 14px;
    height: 14px;
    color: var(--muted);
    transition: transform 0.12s;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .icon {
    flex: none;
    width: 15px;
    height: 15px;
    color: var(--muted);
  }
  .label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .empty {
    height: 24px;
    line-height: 24px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
