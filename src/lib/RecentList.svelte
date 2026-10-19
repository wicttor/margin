<script lang="ts">
  import { basename, dirname } from "./api";
  import Icon from "./ui/Icon.svelte";
  import { tooltip } from "./ui/tooltip";

  /** A boxed list of recent folders or files: name, location, and a remove button. */
  let {
    paths,
    kind,
    home,
    onOpen,
    onRemove,
  }: {
    paths: string[];
    kind: "folder" | "file";
    home: string | null;
    onOpen: (path: string) => void;
    onRemove: (path: string) => void;
  } = $props();

  /** A path for display, with the home folder shortened to "~". */
  function shorten(path: string) {
    const root = home?.replace(/[\\/]$/, "");
    return root && path.startsWith(root) ? "~" + path.slice(root.length) : path;
  }
</script>

<div class="boxed-list">
  {#each paths as path (path)}
    <div class="row activatable">
      <button class="open" onclick={() => onOpen(path)}>
        <Icon name={kind === "folder" ? "folder" : "text-x-generic"} class="icon" />
        <span class="text">
          <span class="title">{basename(path)}</span>
          <span class="subtitle caption dim-label">
            {shorten(kind === "folder" ? path : dirname(path))}
          </span>
        </span>
      </button>
      <button
        class="btn image flat circular remove"
        use:tooltip={"Remove From List"}
        onclick={() => onRemove(path)}
      >
        <Icon name="window-close" />
      </button>
    </div>
  {/each}
</div>

<style>
  .row {
    padding: 0 6px 0 0 !important;
  }
  .open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: calc(var(--list-row-height) + 4px);
    padding: 6px 12px;
    border: 0;
    background: none;
    text-align: start;
  }
  .open :global(.icon) {
    flex: none;
    opacity: var(--dim-opacity);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .title,
  .subtitle {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .remove {
    flex: none;
    min-width: 30px;
    min-height: 30px;
    width: 30px;
    height: 30px;
    opacity: 0;
  }
  .row:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .remove :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
