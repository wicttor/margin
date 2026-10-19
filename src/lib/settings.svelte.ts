/*
 * Preferences: every option in the Preferences dialog, with its default.
 * Saved to ~/.margin/settings.json and applied as soon as they change.
 */
import { loadSettings, saveSettings } from "./api";

export type Size = "small" | "medium" | "large";
export type TerminalColors =
  | "app"
  | "github-light"
  | "github-dark"
  | "github-colorblind-light"
  | "github-colorblind-dark"
  | "github-tritanopia-light"
  | "github-tritanopia-dark";

export interface Preferences {
  // Appearance
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  uiTextSize: Size;
  docTextSize: Size;
  documentFont: "sans" | "serif" | "system";
  /** An installed monospace font, or "" for the system's. */
  codeFont: string;
  colorVision: "default" | "red-green" | "blue-yellow";
  // Files & Folders
  openWith: "double" | "single";
  showHidden: boolean;
  hiddenFolders: string[];
  externalSizeMB: number;
  autoReload: boolean;
  // Projects & History
  closeOnSwitch: boolean;
  restoreProjectFiles: boolean;
  restoreLastProject: boolean;
  recentFolders: number;
  recentFiles: number;
  // Markdown Editor
  markdownMode: "wysiwyg" | "source";
  bullet: "-" | "*" | "+";
  imagesFolder: string;
  linkClick: "ctrl" | "click";
  // Code Editor
  lineNumbers: boolean;
  wrapLines: boolean;
  tabWidth: 2 | 4 | 8;
  highlightLine: boolean;
  // Terminal
  shell: string;
  shellArgs: string;
  terminalStart: "folder" | "home";
  terminalColors: TerminalColors;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  // Printing
  printMargins: "normal" | "narrow" | "wide";
  printLineNumbers: boolean;
}

export const DEFAULTS: Readonly<Preferences> = Object.freeze({
  theme: "system",
  density: "comfortable",
  uiTextSize: "medium",
  docTextSize: "medium",
  documentFont: "sans",
  codeFont: "",
  colorVision: "default",
  openWith: "double",
  showHidden: false,
  hiddenFolders: ["node_modules", "__pycache__"],
  externalSizeMB: 20,
  autoReload: true,
  closeOnSwitch: true,
  restoreProjectFiles: true,
  restoreLastProject: true,
  recentFolders: 10,
  recentFiles: 15,
  markdownMode: "wysiwyg",
  bullet: "-",
  imagesFolder: "assets",
  linkClick: "ctrl",
  lineNumbers: true,
  wrapLines: false,
  tabWidth: 4,
  highlightLine: true,
  shell: "",
  shellArgs: "",
  terminalStart: "folder",
  terminalColors: "app",
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  printMargins: "normal",
  printLineNumbers: false,
} as Preferences);

const SCALE: Record<Size, number> = { small: 0.9, medium: 1, large: 1.15 };
const MONO_FALLBACK =
  '"Adwaita Mono", "Source Code Pro", "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const DOCUMENT_FONTS = {
  sans: 'var(--font-ui)',
  serif: '"Noto Serif", "Source Serif 4", "Source Serif Pro", Georgia, Cambria, "Times New Roman", serif',
  system: 'system-ui, -apple-system, "Segoe UI", Ubuntu, Cantarell, sans-serif',
};
const PAGE_MARGINS = { narrow: "10mm 10mm", normal: "18mm 16mm", wide: "25mm 25mm" };
/** The theme is also cached here, so the window starts in the right colors. */
const THEME_CACHE_KEY = "margin.theme";

function fresh(): Preferences {
  return { ...DEFAULTS, hiddenFolders: [...DEFAULTS.hiddenFolders] };
}

class PreferencesStore {
  values = $state<Preferences>(fresh());
  /** Whether the system is in dark mode; used when the theme is "system". */
  systemDark = $state(false);
  scheme = $derived<"light" | "dark">(
    this.values.theme === "system" ? (this.systemDark ? "dark" : "light") : this.values.theme,
  );
  uiScale = $derived(SCALE[this.values.uiTextSize]);
  docScale = $derived(SCALE[this.values.docTextSize]);
  /** The code font as a CSS font-family list, with fallbacks. */
  monoFamily = $derived(
    this.values.codeFont ? `"${this.values.codeFont}", ${MONO_FALLBACK}` : MONO_FALLBACK,
  );
  listOptions = $derived({
    showHidden: this.values.showHidden,
    hiddenFolders: [...this.values.hiddenFolders],
  });

  private loaded = false;

  constructor() {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemDark = query.matches;
    query.addEventListener("change", () => (this.systemDark = query.matches));
  }

  async load() {
    try {
      const json = await loadSettings();
      const saved = json ? JSON.parse(json) : {};
      const merged = fresh();
      // Only keep known options whose type matches, so an old or hand-edited file can't break the app.
      for (const key of Object.keys(merged) as (keyof Preferences)[]) {
        const value = saved[key];
        if (value === undefined || typeof value !== typeof merged[key]) continue;
        if (Array.isArray(merged[key]) && !Array.isArray(value)) continue;
        (merged as any)[key] = value;
      }
      this.values = merged;
    } catch {
      // Unreadable settings: keep the defaults.
    }
    this.loaded = true;
  }

  reset() {
    this.values = fresh();
  }

  save() {
    if (!this.loaded) return;
    saveSettings(JSON.stringify(this.values, null, 2)).catch((e) =>
      console.warn("Cannot save preferences:", e),
    );
  }

  /** Applies appearance options to the page: theme, spacing, sizes, fonts, color vision, print margins. */
  apply() {
    const root = document.documentElement;
    const v = this.values;
    root.dataset.scheme = this.scheme;
    root.dataset.density = v.density;
    root.dataset.vision = v.colorVision;
    root.style.colorScheme = this.scheme;
    root.style.setProperty("--ui-scale", String(this.uiScale));
    root.style.setProperty("--doc-scale", String(this.docScale));
    root.style.setProperty("--font-document", DOCUMENT_FONTS[v.documentFont]);
    root.style.setProperty("--font-mono", this.monoFamily);
    let pageStyle = document.getElementById("page-margins");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "page-margins";
      document.head.append(pageStyle);
    }
    pageStyle.textContent = `@page { margin: ${PAGE_MARGINS[v.printMargins]}; }`;
    try {
      localStorage.setItem(THEME_CACHE_KEY, this.scheme);
    } catch {}
  }
}

export const prefs = new PreferencesStore();

// Apply and save whenever a preference changes.
$effect.root(() => {
  $effect(() => prefs.apply());
  $effect(() => {
    void JSON.stringify(prefs.values);
    prefs.save();
  });
});

/**
 * Monospace fonts from a list of common ones that are installed. Detected by
 * measuring text: an installed font renders at a different width than the fallbacks.
 */
export function installedMonospaceFonts(): string[] {
  const candidates = [
    "Adwaita Mono",
    "Cascadia Code",
    "Cascadia Mono",
    "Consolas",
    "Courier New",
    "DejaVu Sans Mono",
    "Fira Code",
    "Fira Mono",
    "Hack",
    "IBM Plex Mono",
    "Inconsolata",
    "Iosevka",
    "JetBrains Mono",
    "Liberation Mono",
    "Menlo",
    "Monaco",
    "Noto Sans Mono",
    "SF Mono",
    "Source Code Pro",
    "Ubuntu Mono",
  ];
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [];
  const sample = "mmmmmmmmmmlli1WW@#0O";
  const width = (family: string) => {
    context.font = `40px ${family}`;
    return context.measureText(sample).width;
  };
  const bases = ["monospace", "serif", "sans-serif"];
  const baseWidths = bases.map(width);
  return candidates.filter((name) =>
    bases.some((base, i) => width(`"${name}", ${base}`) !== baseWidths[i]),
  );
}

/** Splits shell arguments on spaces, keeping "quoted parts" together. */
export function splitArgs(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}
