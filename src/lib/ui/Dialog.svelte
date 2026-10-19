<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import { tooltip } from "./tooltip";

  /** AdwDialog: a floating window-like dialog with its own header bar and close button. */
  let {
    title = "",
    width = 480,
    onclose,
    children,
  }: { title?: string; width?: number; onclose: () => void; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="dialog-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} style:width="{width}px">
    <header class="headerbar flat">
      <div class="start"></div>
      <div class="center"><div class="window-title heading">{title}</div></div>
      <div class="end">
        <button class="btn image circular close" use:tooltip={"Close"} onclick={onclose}>
          <Icon name="window-close" />
        </button>
      </div>
    </header>
    <div class="content">
      {@render children()}
    </div>
  </div>
</div>

<style>
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
  .content {
    overflow-y: auto;
    padding: 0 24px 24px;
  }
</style>
