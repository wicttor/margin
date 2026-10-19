<script lang="ts" module>
  export interface MenuItem {
    /** Label with the access key marked by an underscore, as in GTK: "_Open File…". */
    label: string;
    accel?: string;
    checked?: boolean;
    disabled?: boolean;
    action: () => unknown;
  }
  /** A menu is a list of sections, separated by a line. */
  export type MenuSections = MenuItem[][];

  export function plainLabel(label: string) {
    return label.replace(/_(.)/, "$1");
  }
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    sections,
    anchor,
    align = "end",
    onclose,
  }: {
    sections: MenuSections;
    /** An element's box to open below, or a pointer position. */
    anchor: DOMRect | { x: number; y: number };
    align?: "start" | "end";
    onclose: () => void;
  } = $props();

  let menu: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);
  let focused = $state(-1);
  let showMnemonics = $state(false);

  let items = $derived(sections.flat());

  function split(label: string) {
    const i = label.indexOf("_");
    if (i < 0) return { before: label, key: "", after: "" };
    return { before: label.slice(0, i), key: label[i + 1], after: label.slice(i + 2) };
  }

  function activate(item: MenuItem) {
    if (item.disabled) return;
    onclose();
    item.action();
  }

  function move(step: number) {
    const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(focused);
    focused = enabled[(pos + step + enabled.length) % enabled.length];
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Alt") showMnemonics = true;
    if (e.key === "Escape") onclose();
    else if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "Enter" && focused >= 0) activate(items[focused]);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const key = e.key.toLowerCase();
      const item = items.find((it) => split(it.label).key.toLowerCase() === key);
      if (item) activate(item);
      else return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  onMount(async () => {
    await tick();
    const box = menu.getBoundingClientRect();
    let x: number;
    let y: number;
    if ("width" in anchor) {
      x = align === "end" ? anchor.right - box.width : anchor.left;
      y = anchor.bottom + 4;
    } else {
      x = anchor.x;
      y = anchor.y;
    }
    left = Math.max(6, Math.min(x, window.innerWidth - box.width - 6));
    top = Math.max(6, Math.min(y, window.innerHeight - box.height - 6));
    menu.focus();
  });
</script>

<svelte:window onkeydowncapture={onkeydown} onkeyup={(e) => e.key === "Alt" && (showMnemonics = false)} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="menu-catcher" onpointerdown={onclose} oncontextmenu={(e) => e.preventDefault()}></div>
<div
  class="popover"
  role="menu"
  tabindex="-1"
  bind:this={menu}
  style:left="{left}px"
  style:top="{top}px"
>
  {#each sections as section, s}
    {#if s > 0}<div class="menu-separator" role="separator"></div>{/if}
    {#each section as item}
      {@const parts = split(item.label)}
      {@const index = items.indexOf(item)}
      <button
        class="menu-item"
        class:focused={focused === index}
        role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
        aria-checked={item.checked}
        disabled={item.disabled}
        onpointerenter={() => (focused = index)}
        onclick={() => activate(item)}
      >
        <span class="label"
          >{parts.before}<span class:mnemonic={showMnemonics}>{parts.key}</span>{parts.after}</span
        >
        {#if item.accel}<span class="accel">{item.accel}</span>{/if}
        {#if item.checked !== undefined}
          <span class="check">{#if item.checked}<Icon name="object-select" />{/if}</span>
        {/if}
      </button>
    {/each}
  {/each}
</div>

<style>
  .menu-catcher {
    position: fixed;
    inset: 0;
    z-index: 49;
  }
  .mnemonic {
    text-decoration: underline;
  }
</style>
