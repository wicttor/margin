import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { LanguageDescription, syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown } from "@codemirror/lang-markdown";
import { classHighlighter, highlightCode } from "@lezer/highlight";
import { basename } from "./api";

/** Finds the language for a file name, from the ~100 that CodeMirror supports. */
export function languageFor(path: string | null): LanguageDescription | null {
  if (!path) return null;
  return LanguageDescription.matchFilename(languages, basename(path));
}

/** Tokens get `tok-*` classes, colored in app.css, so the editor and printouts match. */
const highlighting = syntaxHighlighting(classHighlighter);

/** The raw markdown editor: no line numbers, wrapped lines, highlighted fenced code. */
export function markdownSourceExtensions(onChange: (text: string) => void): Extension[] {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ codeLanguages: languages }),
    highlighting,
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.doc.toString())),
  ];
}

/**
 * A code editor: line numbers, folding, search, bracket matching. The language
 * loads asynchronously and is slotted into `language` when ready.
 */
export function codeExtensions(
  language: Compartment,
  onChange: (text: string) => void,
): Extension[] {
  return [
    basicSetup,
    language.of([]),
    highlighting,
    EditorState.tabSize.of(4),
    EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.doc.toString())),
  ];
}

/** Renders text as static highlighted HTML, for printing. The editor itself only draws visible lines. */
export function renderHighlighted(target: HTMLElement, text: string, support: LanguageSupport | null) {
  target.replaceChildren();
  if (!support) {
    target.textContent = text;
    return;
  }
  const tree = support.language.parser.parse(text);
  highlightCode(
    text,
    tree,
    classHighlighter,
    (chunk, classes) => {
      if (!classes) {
        target.append(chunk);
        return;
      }
      const span = document.createElement("span");
      span.className = classes;
      span.textContent = chunk;
      target.append(span);
    },
    () => target.append("\n"),
  );
}
