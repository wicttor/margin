<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { Crepe } from "@milkdown/crepe";
  import "@milkdown/crepe/theme/common/style.css";
  import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
  import { imageInlineComponent, inlineImageConfig } from "@milkdown/kit/component/image-inline";
  import { insert } from "@milkdown/kit/utils";
  import { EditorView } from "@codemirror/view";
  import { Compartment, EditorState } from "@codemirror/state";
  import type { LanguageSupport } from "@codemirror/language";
  import { markdown } from "@codemirror/lang-markdown";
  import { languages } from "@codemirror/language-data";
  import {
    codeExtensions,
    codeOptionExtensions,
    languageFor,
    markdownSourceExtensions,
    renderHighlighted,
  } from "./codemirror";
  import { imageUrl, saveAsset } from "./api";
  import type { Tab } from "./state.svelte";
  import { prefs } from "./settings.svelte";
  import { overlays } from "./ui/overlays.svelte";

  let {
    tab,
    active,
    onLink,
  }: { tab: Tab; active: boolean; onLink: (href: string, tab: Tab) => void } = $props();

  let crepeHost = $state<HTMLDivElement>();
  let sourceHost: HTMLDivElement;
  let printView: HTMLPreElement;

  let isCode = $derived(tab.kind === "code");
  const languageSlot = new Compartment();
  const optionsSlot = new Compartment();
  let codeOptions = $derived({
    lineNumbers: prefs.values.lineNumbers,
    wrapLines: prefs.values.wrapLines,
    tabWidth: prefs.values.tabWidth,
    highlightLine: prefs.values.highlightLine,
  });
  /** A code file's language, loaded by file name. Also used to highlight printouts. */
  let language: LanguageSupport | null = null;

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
      return await saveAsset(tab.path, file, prefs.values.imagesFolder);
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
    if (!crepeHost) return;
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
        ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, bullet: prefs.values.bullet }));
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
    const onChange = (text: string) => (tab.content = text);
    source = new EditorView({
      parent: sourceHost,
      state: EditorState.create({
        doc: tab.content,
        extensions: isCode
          ? codeExtensions(languageSlot, optionsSlot, codeOptions, onChange)
          : markdownSourceExtensions(onChange),
      }),
    });
    if (active) source.focus();
  }

  /** Loads syntax highlighting for a code file, by its name. Runs again after "Save As". */
  async function loadLanguage(path: string | null) {
    const support = (await languageFor(path)?.load()) ?? null;
    if (path !== tab.path) return;
    language = support;
    source?.dispatch({ effects: languageSlot.reconfigure(support ?? []) });
  }

  function sync() {
    if (isCode) {
      showSource();
      return;
    }
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

  $effect(() => {
    const path = tab.path;
    if (isCode) untrack(() => loadLanguage(path));
  });

  $effect(() => {
    tab.preparePrint = () => {
      if (tab.mode !== "source") printView.replaceChildren();
      else if (isCode)
        renderHighlighted(printView, tab.content, language, prefs.values.printLineNumbers);
      else renderHighlighted(printView, tab.content, markdown({ codeLanguages: languages }));
    };
    return () => (tab.preparePrint = null);
  });

  // Code Editor preferences apply to open editors.
  $effect(() => {
    const options = codeOptionExtensions(codeOptions);
    untrack(() => source?.dispatch({ effects: optionsSlot.reconfigure(options) }));
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
    const follow = event.ctrlKey || event.metaKey || prefs.values.linkClick === "click";
    if (href && follow) onLink(href, tab);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="doc-view"
  class:active
  class:code={isCode}
  class:source-mode={tab.mode === "source"}
  onclick={onClick}
>
  {#if !isCode}
    <div
      class="page"
      class:hidden={tab.mode !== "wysiwyg"}
      bind:this={crepeHost}
      onpastecapture={onPaste}
    ></div>
  {/if}
  <div class="page source" class:hidden={tab.mode !== "source"} bind:this={sourceHost}></div>
  <pre class="print-view" bind:this={printView}></pre>
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
    padding: var(--page-padding-y) var(--page-padding-x) 40vh;
  }
  .hidden,
  .print-view {
    display: none;
  }
  .code .page {
    max-width: none;
    padding: 0;
  }
  .code .source :global(.cm-editor) {
    min-height: 100%;
  }
  .code .source :global(.cm-gutters) {
    border: 0;
    background: var(--view-bg-color);
    color: color-mix(in srgb, var(--view-fg-color) 45%, transparent);
  }
  .code .source :global(.cm-activeLine),
  .code .source :global(.cm-activeLineGutter) {
    background: color-mix(in srgb, var(--view-fg-color) 4%, transparent);
  }
  .code .source :global(.cm-content) {
    padding: 8px 0 40vh;
  }
  .source :global(.cm-editor) {
    font-family: var(--font-mono);
    font-size: calc(14px * var(--doc-scale));
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
