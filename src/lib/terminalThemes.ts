import type { ITheme } from "@xterm/xterm";
import type { TerminalColors } from "./settings.svelte";

type Ansi = Pick<
  ITheme,
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white"
  | "brightBlack" | "brightRed" | "brightGreen" | "brightYellow"
  | "brightBlue" | "brightMagenta" | "brightCyan" | "brightWhite"
>;

/** GNOME Terminal's palette. */
const GNOME: Ansi = {
  black: "#241f31", red: "#c01c28", green: "#2ec27e", yellow: "#f5c211",
  blue: "#1e78e4", magenta: "#9841bb", cyan: "#0ab9dc", white: "#c0bfbc",
  brightBlack: "#5e5c64", brightRed: "#ed333b", brightGreen: "#57e389", brightYellow: "#f8e45c",
  brightBlue: "#51a1ff", brightMagenta: "#c061cb", brightCyan: "#4fd2fd", brightWhite: "#f6f5f4",
};

/*
 * GitHub's terminal colors, from @primer/primitives 11.10. The colorblind
 * (protanopia/deuteranopia) themes swap red for orange and green for blue;
 * tritanopia keeps red and swaps green for blue.
 */
const GITHUB_LIGHT: Ansi = {
  black: "#1f2328", red: "#cf222e", green: "#116329", yellow: "#4d2d00",
  blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#59636e",
  brightBlack: "#393f46", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01",
  brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#818b98",
};
const GITHUB_DARK: Ansi = {
  black: "#2f3742", red: "#ff7b72", green: "#3fb950", yellow: "#d29922",
  blue: "#58a6ff", magenta: "#be8fff", cyan: "#39c5cf", white: "#f0f6fc",
  brightBlack: "#656c76", brightRed: "#ffa198", brightGreen: "#56d364", brightYellow: "#e3b341",
  brightBlue: "#79c0ff", brightMagenta: "#d2a8ff", brightCyan: "#56d4dd", brightWhite: "#ffffff",
};
const GITHUB: Record<Exclude<TerminalColors, "app">, Ansi & { dark: boolean }> = {
  "github-light": { ...GITHUB_LIGHT, dark: false },
  "github-dark": { ...GITHUB_DARK, dark: true },
  "github-colorblind-light": {
    ...GITHUB_LIGHT, dark: false,
    red: "#bc4c00", brightRed: "#953800", green: "#0550ae", brightGreen: "#0969da",
  },
  "github-colorblind-dark": {
    ...GITHUB_DARK, dark: true,
    red: "#f0883e", brightRed: "#ffa657", green: "#58a6ff", brightGreen: "#79c0ff",
  },
  "github-tritanopia-light": {
    ...GITHUB_LIGHT, dark: false, green: "#0550ae", brightGreen: "#0969da",
  },
  "github-tritanopia-dark": {
    ...GITHUB_DARK, dark: true, green: "#58a6ff", brightGreen: "#79c0ff",
  },
};

const SURFACES = {
  /** The app's own view colors, so the terminal blends in. */
  app: {
    light: { background: "#ffffff", foreground: "#323235" },
    dark: { background: "#1d1d20", foreground: "#ffffff" },
  },
  github: {
    light: { background: "#ffffff", foreground: "#1f2328" },
    dark: { background: "#0d1117", foreground: "#f0f6fc" },
  },
};

function withSurface(colors: Ansi, surface: { background: string; foreground: string }): ITheme {
  return {
    ...colors,
    ...surface,
    cursor: surface.foreground,
    cursorAccent: surface.background,
    selectionBackground: "#3584e450",
  };
}

/**
 * The terminal colors for the preferences. "Follow app theme" uses GNOME's
 * colors on the app background, or GitHub's colorblind or tritanopia colors when
 * a color vision option is set.
 */
export function terminalTheme(
  choice: TerminalColors,
  scheme: "light" | "dark",
  colorVision: "default" | "red-green" | "blue-yellow",
): ITheme {
  if (choice !== "app") {
    const { dark, ...colors } = GITHUB[choice];
    return withSurface(colors, SURFACES.github[dark ? "dark" : "light"]);
  }
  const surface = SURFACES.app[scheme];
  if (colorVision === "red-green") return withSurface(GITHUB[`github-colorblind-${scheme}`], surface);
  if (colorVision === "blue-yellow") return withSurface(GITHUB[`github-tritanopia-${scheme}`], surface);
  return withSurface(GNOME, surface);
}
