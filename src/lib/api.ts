import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
}

export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd", "mkdn", "mdx"];

export const listDir = (path: string) => invoke<Entry[]>("list_dir", { path });
export const readFile = (path: string) => invoke<string>("read_file", { path });
export const writeFile = (path: string, contents: string) =>
  invoke<void>("write_file", { path, contents });
export const pathExists = (path: string) => invoke<boolean>("path_exists", { path });
export const watchFolder = (path: string) => invoke<void>("watch_folder", { path });
export const printPage = () => invoke<void>("print_page");
export const takePendingOpens = () => invoke<string[]>("take_pending_opens");

/** Saves image bytes into `<doc folder>/assets/` and returns the path relative to the document. */
export async function saveAsset(docPath: string, file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return invoke<string>("save_asset", bytes, {
    headers: {
      "x-doc-path": encodeURIComponent(docPath),
      "x-file-name": encodeURIComponent(file.name || "image.png"),
    },
  });
}

export function isMarkdown(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MARKDOWN_EXTENSIONS.includes(ext);
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i <= 0 ? path.slice(0, i + 1) : path.slice(0, i);
}

/** Resolves a relative markdown URL (`./img/a.png`, `../notes.md`) against a folder. */
export function resolvePath(dir: string, relative: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const parts = dir.split(/[\\/]/);
  for (const part of decodeURI(relative).split(/[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 1) parts.pop();
    } else parts.push(part);
  }
  return parts.join(sep);
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function hasScheme(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !/^[a-zA-Z]:[\\/]/.test(url);
}

/** Turns an image URL from the markdown into something the webview can load. */
export function imageUrl(url: string, docPath: string | null): string {
  if (!url || hasScheme(url)) return url;
  if (isAbsolutePath(url)) return convertFileSrc(url);
  if (!docPath) return url;
  return convertFileSrc(resolvePath(dirname(docPath), url));
}

/** For a link in a document: the local file it points to, or null for web links and anchors. */
export function localLinkTarget(href: string, docPath: string | null): string | null {
  if (!href || href.startsWith("#")) return null;
  if (href.startsWith("file://")) return decodeURI(href.replace(/^file:\/\/(localhost)?/, ""));
  if (hasScheme(href)) return null;
  const path = href.split("#")[0];
  if (isAbsolutePath(path)) return path;
  return docPath ? resolvePath(dirname(docPath), path) : null;
}
