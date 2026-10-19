<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "./Icon.svelte";
  import { tooltip } from "./tooltip";

  /** GTK-style minimize / maximize / close buttons for the header bar (not used on macOS). */
  const win = getCurrentWindow();
  let maximized = $state(false);

  onMount(() => {
    const refresh = () => win.isMaximized().then((m) => (maximized = m), () => {});
    refresh();
    const unlisten = win.onResized(refresh);
    return () => void unlisten.then((u) => u());
  });
</script>

<div class="window-controls">
  <button class="control" use:tooltip={"Minimize"} onclick={() => win.minimize()}>
    <Icon name="window-minimize" />
  </button>
  <button
    class="control"
    use:tooltip={maximized ? "Restore" : "Maximize"}
    onclick={() => win.toggleMaximize()}
  >
    <Icon name={maximized ? "window-restore" : "window-maximize"} />
  </button>
  <button class="control" use:tooltip={"Close"} onclick={() => win.close()}>
    <Icon name="window-close" />
  </button>
</div>

<style>
  .window-controls {
    display: flex;
    gap: 13px;
    margin: 0 7px 0 12px;
  }
  .control {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 9999px;
    background: color-mix(in srgb, currentColor 10%, transparent);
    transition: background-color 200ms;
  }
  .control:hover {
    background: color-mix(in srgb, currentColor 15%, transparent);
  }
  .control:active {
    background: color-mix(in srgb, currentColor 30%, transparent);
  }
  .control :global(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 1.7;
  }
</style>
