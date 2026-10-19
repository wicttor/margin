import { loadRecent, pathExists, saveRecent } from "./api";
import { prefs } from "./settings.svelte";

/** Recently opened projects (folders) and files, newest first. */
class Recent {
  projects = $state<string[]>([]);
  files = $state<string[]>([]);

  async load() {
    try {
      const json = await loadRecent();
      const data = json ? JSON.parse(json) : {};
      this.projects = Array.isArray(data.projects) ? data.projects : [];
      this.files = Array.isArray(data.files) ? data.files : [];
    } catch {
      // A missing or unreadable history just starts empty.
    }
  }

  addProject(path: string) {
    this.projects = [path, ...this.projects.filter((p) => p !== path)].slice(
      0,
      prefs.values.recentFolders,
    );
    this.save();
  }

  addFile(path: string) {
    this.files = [path, ...this.files.filter((p) => p !== path)].slice(0, prefs.values.recentFiles);
    this.save();
  }

  remove(path: string) {
    this.projects = this.projects.filter((p) => p !== path);
    this.files = this.files.filter((p) => p !== path);
    this.save();
  }

  clear() {
    this.projects = [];
    this.files = [];
    this.save();
  }

  private save() {
    const data = { projects: this.projects, files: this.files };
    saveRecent(JSON.stringify(data, null, 2)).catch((e) => console.warn("Cannot save history:", e));
  }
}

export const recent = new Recent();

/** The paths that still exist on disk, in the same order. */
export async function existingPaths(paths: string[]): Promise<string[]> {
  const found = await Promise.all(paths.map((p) => pathExists(p).catch(() => false)));
  return paths.filter((_, i) => found[i]);
}
