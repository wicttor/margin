import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
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

export interface CodeOptions {
  lineNumbers: boolean;
  wrapLines: boolean;
  tabWidth: number;
  highlightLine: boolean;
}

/** The parts of the code editor that follow the Code Editor preferences. */
export function codeOptionExtensions(o: CodeOptions): Extension[] {
  return [
    o.lineNumbers ? [lineNumbers(), foldGutter()] : [],
    o.lineNumbers && o.highlightLine ? highlightActiveLineGutter() : [],
    o.highlightLine ? highlightActiveLine() : [],
    o.wrapLines ? EditorView.lineWrapping : [],
    EditorState.tabSize.of(o.tabWidth),
  ];
}

/**
 * A code editor: search, folding, bracket matching, completion. The language
 * loads asynchronously and goes into `language` when ready; the preferences go
 * into `options` and can be swapped while the editor is open.
 */
export function codeExtensions(
  language: Compartment,
  options: Compartment,
  initial: CodeOptions,
  onChange: (text: string) => void,
): Extension[] {
  return [
    options.of(codeOptionExtensions(initial)),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    language.of([]),
    highlighting,
    EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.doc.toString())),
  ];
}

/**
 * Renders text as static highlighted HTML, one element per line, for printing.
 * The editor itself only draws the lines on screen. With `numbered`, CSS
 * numbers the lines.
 */
export function renderHighlighted(
  target: HTMLElement,
  text: string,
  support: LanguageSupport | null,
  numbered = false,
) {
  target.replaceChildren();
  target.classList.toggle("numbered", numbered);
  let line = document.createElement("span");
  line.className = "line";
  target.append(line);
  const newLine = () => {
    line = document.createElement("span");
    line.className = "line";
    target.append(line);
  };
  const put = (chunk: string, classes: string) => {
    if (!classes) return line.append(chunk);
    const span = document.createElement("span");
    span.className = classes;
    span.textContent = chunk;
    line.append(span);
  };
  if (!support) {
    text.split("\n").forEach((chunk, i) => {
      if (i > 0) newLine();
      put(chunk, "");
    });
    return;
  }
  highlightCode(text, support.language.parser.parse(text), classHighlighter, put, newLine);
}
