<script lang="ts">
  import { getVersion } from "@tauri-apps/api/app";
  import { overlays } from "./overlays.svelte";
  import Dialog from "./Dialog.svelte";
  import Icon from "./Icon.svelte";
  import { accelKeys } from "./platform";
  import { tooltip } from "./tooltip";
  import appIcon from "../assets/app-icon.png";

  const SHORTCUTS: { title: string; items: [string, string][] }[] = [
    {
      title: "Files",
      items: [
        ["New document", "Primary+N"],
        ["Open file", "Primary+O"],
        ["Open folder", "Primary+Shift+O"],
        ["Save", "Primary+S"],
        ["Save as", "Primary+Shift+S"],
        ["Print", "Primary+P"],
      ],
    },
    {
      title: "Tabs",
      items: [
        ["New tab", "Primary+T"],
        ["Close tab", "Primary+W"],
        ["Next tab", "Primary+Page Down"],
        ["Previous tab", "Primary+Page Up"],
        ["Switch to tab 1–9", "Alt+1…9"],
      ],
    },
    {
      title: "View",
      items: [
        ["Show sidebar", "F9"],
        ["Show markdown source", "Primary+/"],
      ],
    },
    {
      title: "General",
      items: [
        ["Main menu", "F10"],
        ["Keyboard shortcuts", "Primary+?"],
      ],
    },
  ];

  let version = $state("");
  getVersion().then((v) => (version = v), () => {});

  let alert = $derived(overlays.alerts[0]);

  function onAlertKey(e: KeyboardEvent) {
    if (!alert) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      alert.resolve(alert.closeResponse);
    }
  }

  function focusDefault(node: HTMLElement, isDefault: boolean) {
    if (isDefault) queueMicrotask(() => node.focus());
  }
</script>

<svelte:window onkeydowncapture={onAlertKey} />

{#if overlays.dialog === "shortcuts"}
  <Dialog title="Keyboard Shortcuts" width={520} onclose={() => (overlays.dialog = null)}>
    {#each SHORTCUTS as group}
      <h2 class="group-title heading">{group.title}</h2>
      <div class="boxed-list">
        {#each group.items as [label, accel]}
          <div class="row">
            <span>{label}</span>
            <span class="keys">
              {#each accelKeys(accel) as key}<kbd>{key}</kbd>{/each}
            </span>
          </div>
        {/each}
      </div>
    {/each}
  </Dialog>
{/if}

{#if overlays.dialog === "about"}
  <Dialog width={360} onclose={() => (overlays.dialog = null)}>
    <div class="about">
      <img src={appIcon} alt="" width="128" height="128" />
      <h1 class="title-1">Margin</h1>
      <div>wicttor</div>
      {#if version}<span class="version">{version}</span>{/if}
      <p class="dim-label">A markdown editor that renders as you type.</p>
      <div class="boxed-list">
        <div class="row"><span>License</span><span class="dim-label">MIT</span></div>
        <div class="row"><span>Built with</span><span class="dim-label">Tauri, Svelte, Milkdown</span></div>
      </div>
    </div>
  </Dialog>
{/if}

{#if alert}
  <div class="dialog-backdrop">
    <div class="dialog alert" role="alertdialog" aria-modal="true" aria-label={alert.heading}>
      <div class="message">
        <h2 class="title-2">{alert.heading}</h2>
        {#if alert.body}<p>{alert.body}</p>{/if}
      </div>
      <div class="responses">
        {#each alert.responses as response}
          <button
            class="btn"
            class:suggested-action={response.appearance === "suggested"}
            class:destructive-action={response.appearance === "destructive"}
            use:focusDefault={response.id === alert.defaultResponse}
            onclick={() => alert.resolve(response.id)}
          >
            {response.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<div class="toast-overlay" aria-live="polite">
  {#each overlays.toasts as toast (toast.id)}
    <div class="toast">
      <span>{toast.title}</span>
      <button
        class="btn image circular flat toast-close"
        use:tooltip={"Dismiss"}
        onclick={() => overlays.dismissToast(toast.id)}
      >
        <Icon name="window-close" />
      </button>
    </div>
  {/each}
</div>

<style>
  .group-title {
    margin: 18px 0 6px;
    font-size: 11pt;
  }
  .group-title:first-child {
    margin-top: 0;
  }
  .boxed-list {
    overflow: hidden;
    border-radius: 12px;
    background: var(--card-bg-color);
    box-shadow:
      0 0 0 1px var(--card-shade-color),
      0 1px 3px 1px var(--card-shade-color);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 50px;
    padding: 8px 12px;
    text-align: start;
  }
  .row + .row {
    border-top: 1px solid var(--card-shade-color);
  }
  .keys {
    display: flex;
    gap: 4px;
  }

  .about {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  .about img {
    margin-bottom: 6px;
  }
  .about h1 {
    margin: 0;
  }
  .about p {
    margin: 12px 0;
  }
  .about .boxed-list {
    width: 100%;
  }
  .version {
    margin-top: 6px;
    padding: 3px 12px;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--accent-bg-color) 15%, transparent);
    color: var(--accent-color);
    font-weight: 700;
  }

  .alert {
    width: 372px;
  }
  .message {
    padding: 32px 30px 24px;
    text-align: center;
  }
  .message h2 {
    margin: 0 0 12px;
  }
  .message p {
    margin: 0;
    line-height: 1.4;
  }
  .responses {
    display: flex;
    gap: 12px;
    padding: 0 24px 24px;
  }
  .responses .btn {
    flex: 1;
    min-height: 40px;
    border-radius: 12px;
  }

  .toast-overlay {
    position: fixed;
    left: 50%;
    bottom: 24px;
    z-index: 70;
    transform: translateX(-50%);
  }
  .toast-close {
    min-width: 30px;
    min-height: 30px;
    width: 30px;
    height: 30px;
  }
</style>
