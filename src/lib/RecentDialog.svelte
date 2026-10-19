<script lang="ts">
  import { onMount } from "svelte";
  import { existingPaths, recent } from "./recent.svelte";
  import RecentList from "./RecentList.svelte";
  import Dialog from "./ui/Dialog.svelte";

  let {
    currentFolder,
    home,
    onOpenProject,
    onOpenFile,
    onclose,
  }: {
    currentFolder: string | null;
    home: string | null;
    onOpenProject: (path: string) => void;
    onOpenFile: (path: string) => void;
    onclose: () => void;
  } = $props();

  /** Paths that still exist; moved or deleted ones are left out of the lists. */
  let existing = $state<Set<string> | null>(null);

  onMount(async () => {
    existing = new Set(await existingPaths([...recent.projects, ...recent.files]));
  });

  let projects = $derived(
    existing ? recent.projects.filter((p) => existing!.has(p) && p !== currentFolder) : [],
  );
  let files = $derived(existing ? recent.files.filter((p) => existing!.has(p)) : []);

  function open(action: (path: string) => void) {
    return (path: string) => {
      onclose();
      action(path);
    };
  }
</script>

<Dialog title="Open Recent" width={520} {onclose}>
  {#if existing && projects.length === 0 && files.length === 0}
    <div class="status-page compact">
      <h2 class="title-4">No Recent Items</h2>
      <p class="description dim-label">Folders and files you open will be listed here.</p>
    </div>
  {:else if existing}
    {#if projects.length > 0}
      <h2 class="group-title heading">Projects</h2>
      <RecentList
        paths={projects}
        kind="folder"
        {home}
        onOpen={open(onOpenProject)}
        onRemove={(p) => recent.remove(p)}
      />
    {/if}
    {#if files.length > 0}
      <h2 class="group-title heading">Files</h2>
      <RecentList
        paths={files}
        kind="file"
        {home}
        onOpen={open(onOpenFile)}
        onRemove={(p) => recent.remove(p)}
      />
    {/if}
    <div class="actions">
      <button class="btn" onclick={() => recent.clear()}>Clear History</button>
    </div>
  {/if}
</Dialog>

<style>
  .group-title {
    margin: 18px 0 6px;
    font-size: calc(11pt * var(--ui-scale));
  }
  .group-title:first-child {
    margin-top: 0;
  }
  .actions {
    display: flex;
    justify-content: center;
    margin-top: 18px;
  }
</style>
