<script lang="ts" module>
  /** 16×16 symbolic icons, drawn after the Adwaita icon style. */
  const ICONS = {
    "sidebar-show": "M2.75 2.75h10.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1zM6.25 2.75v10.5M3.75 5.25h1M3.75 7.5h1",
    "open-menu": "M2.5 4h11M2.5 8h11M2.5 12h11",
    "folder-open": "M1.75 12.75V3.25h4l1.5 1.5h5.5v2M1.75 12.75l2-5.5h10.5l-2 5.5z",
    folder: "M1.75 3.25h4l1.5 1.5h7v8h-12.5z",
    "tab-new": "M8 3v10M3 8h10",
    "document-open": "M1.75 12.75V3.25h4l1.5 1.5h5.5v2M1.75 12.75l2-5.5h10.5l-2 5.5z",
    printer: "M4.25 6V1.75h7.5V6M4.25 11.5h-2.5v-5.5h12.5v5.5h-2.5M4.25 9.25h7.5v5h-7.5z",
    "window-minimize": "M4.5 10.5h7",
    "window-maximize": "M4.5 4.5h7v7h-7z",
    "window-restore": "M4.5 6.5h5v5h-5zM6.5 4.5h5v5",
    "window-close": "M4.5 4.5l7 7M11.5 4.5l-7 7",
    "text-x-generic": "M3.25 1.75h6l3.5 3.5v9h-9.5zM9.25 1.75v3.5h3.5M5.5 8.25h5M5.5 10.75h5",
    "go-next": "M6 3.5l4.5 4.5L6 12.5",
    "object-select": "M3 8.5l3 3 7-7",
    "utilities-terminal": "M2.75 2.75h10.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1zM4.5 6l2 2-2 2M8 10.5h3.5",
    "pan-down": "M3.5 6l4.5 4.5L12.5 6",
    "dot": "",
  } as const;

  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  let { name, size = 16, class: className = "" }: { name: IconName; size?: number; class?: string } =
    $props();
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 16 16"
  aria-hidden="true"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "dot"}
    <circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none" />
  {:else}
    <path d={ICONS[name]} />
  {/if}
</svg>
