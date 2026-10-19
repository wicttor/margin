<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { Crepe } from "@milkdown/crepe";
  import "@milkdown/crepe/theme/common/style.css";
  import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
  import { imageInlineComponent, inlineImageConfig } from "@milkdown/kit/component/image-inline";
  import { insert } from "@milkdown/kit/utils";
  import { EditorView, keymap } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import { imageUrl, saveAsset } from "./api";
  import type { Tab } from "./state.svelte";
  import { overlays } from "./ui/overlays.svelte";

  let {
    tab,
    active,
    onLink,
  }: { tab: Tab; active: boolean; onLink: (href: string, tab: Tab) => void } = $props();

  let crepeHost: HTMLDivElement;
  let sourceHost: HTMLDivElement;

  let crepe: Crepe | null = null;
  let builtVersion = -1;
  /** Content when the user switched to source mode, to tell whether the WYSIWYG view is stale. */
  let contentBeforeSource: string | null = null;
  let source: EditorView | null = null;
  /** Increases on every rebuild so a slower, older build can tell it was superseded. */
  let buildSeq = 0;

  async function uploadImage(file: File): Promise<string> {
    if (!tab.path) {
      overlays.toast("Save the document first to add images");
      return "";
    }
    try {
      return await saveAsset(tab.path, file);
    } catch (e) {
      overlays.toast(`Could not save image: ${e}`);
      return "";
    }
  }

  async function buildWysiwyg() {
    const seq = ++buildSeq;
    const version = tab.version;
    const old = crepe;
    crepe = null;
    await old?.destroy();
    if (seq !== buildSeq) return;
    crepeHost.replaceChildren();

    const editor = new Crepe({
      root: crepeHost,
      defaultValue: tab.content,
      features: {
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
        // Crepe's block image stores its size ratio in the alt text, rewriting
        // `![diagram](a.png)` as `![1.00](a.png)`. Plain inline images keep the markdown intact.
        [Crepe.Feature.ImageBlock]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: "Start writing…", mode: "doc" },
      },
    });
    editor.editor
      .config((ctx) => {
        ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, bullet: "-" as const }));
        ctx.update(inlineImageConfig.key, (config) => ({
          ...config,
          proxyDomURL: (url: string) => imageUrl(url, tab.path),
          onUpload: uploadImage,
        }));
      })
      .use(imageInlineComponent);
    editor.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        if (crepe === editor) tab.content = md;
      });
    });
    await editor.create();
    if (seq !== buildSeq) {
      await editor.destroy();
      return;
    }
    crepe = editor;
    builtVersion = version;
    if (tab.baseline === null) tab.baseline = editor.getMarkdown();
    tab.flush = () => tab.mode === "wysiwyg" && flushWysiwyg();
  }

  /** Copies the WYSIWYG editor's latest markdown into the tab, without waiting for its update event. */
  function flushWysiwyg() {
    if (!crepe) return;
    const md = crepe.getMarkdown();
    // An untouched document keeps its original text, so saving it doesn't reformat it.
    if (md !== tab.baseline || tab.content !== tab.diskText) tab.content = md;
  }

  function showSource() {
    if (source) {
      if (source.state.doc.toString() !== tab.content) {
        source.dispatch({
          changes: { from: 0, to: source.state.doc.length, insert: tab.content },
        });
      }
      return;
    }
    source = new EditorView({
      parent: sourceHost,
      state: EditorState.create({
        doc: tab.content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) tab.content = update.state.doc.toString();
          }),
        ],
      }),
    });
    source.focus();
  }

  function sync() {
    if (tab.mode === "source") {
      if (contentBeforeSource === null) {
        flushWysiwyg();
        contentBeforeSource = tab.content;
      }
      showSource();
      return;
    }
    source?.destroy();
    source = null;
    const editedInSource = contentBeforeSource !== null && contentBeforeSource !== tab.content;
    contentBeforeSource = null;
    if (!crepe || builtVersion !== tab.version || editedInSource) void buildWysiwyg();
  }

  $effect(() => {
    // Re-sync when the mode changes or the content is replaced from disk.
    void tab.mode;
    void tab.version;
    untrack(sync);
  });

  onDestroy(() => {
    buildSeq++;
    tab.flush = null;
    void crepe?.destroy();
    source?.destroy();
  });

  /** Pasted image files are saved into `assets/` next to the document. */
  async function onPaste(event: ClipboardEvent) {
    const images = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0 || !crepe) return;
    event.preventDefault();
    event.stopPropagation();
    for (const file of images) {
      const url = await uploadImage(file);
      if (url) crepe?.editor.action(insert(`![](${url})`, true));
    }
  }

  /** Links never navigate the app window; Ctrl/Cmd+click opens them. */
  function onClick(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href && (event.ctrlKey || event.metaKey)) onLink(href, tab);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="doc-view" class:active onclick={onClick}>
  <div
    class="page"
    class:hidden={tab.mode !== "wysiwyg"}
    bind:this={crepeHost}
    onpastecapture={onPaste}
  ></div>
  <div class="page source" class:hidden={tab.mode !== "source"} bind:this={sourceHost}></div>
</div>

<style>
  .doc-view {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    visibility: hidden;
  }
  .doc-view.active {
    visibility: visible;
  }
  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: 36px 72px 40vh;
  }
  .hidden {
    display: none;
  }
  .source :global(.cm-editor) {
    font-family: var(--font-mono);
    font-size: 14px;
    background: transparent;
    color: var(--view-fg-color);
  }
  .source :global(.cm-editor.cm-focused) {
    outline: none;
  }
  .source :global(.cm-content) {
    caret-color: var(--view-fg-color);
  }
  .source :global(.cm-selectionBackground),
  .source :global(.cm-focused .cm-selectionBackground) {
    background: color-mix(in srgb, var(--accent-bg-color) 25%, transparent) !important;
  }
</style>
