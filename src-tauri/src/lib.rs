mod terminal;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Files larger than this open in the system's default app instead of the editor,
/// unless the frontend passes its own limit (a preference).
const MAX_TEXT_SIZE: u64 = 20 * 1024 * 1024;

#[derive(Default)]
struct AppState {
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// Files the OS asked us to open before the frontend was ready to receive them.
    pending_opens: Mutex<Vec<String>>,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum FileContent {
    Text { text: String },
    /// Binary or too large to edit: the frontend hands it to the system's default app.
    External,
}

/// Lists the sub-folders and files of a folder, folders first, both sorted by name.
/// Hidden entries (starting with ".") are left out unless `show_hidden`, and so
/// are folders named in `hidden_folders`.
#[tauri::command]
fn list_dir(path: String, show_hidden: bool, hidden_folders: Vec<String>) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') && !show_hidden {
                return None;
            }
            let path = entry.path();
            // `metadata` follows symlinks, so linked folders show up as folders.
            let is_dir = std::fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
            if is_dir && hidden_folders.contains(&name) {
                return None;
            }
            Some(Entry { name, path: path.to_string_lossy().into_owned(), is_dir })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[derive(Serialize, Debug)]
struct SearchHit {
    name: String,
    path: String,
    /// The folder containing the file, relative to the searched folder ("" for the folder itself).
    dir: String,
}

/// Most results returned, and most matches or folder entries examined, so a
/// one-letter search in a huge folder can't hang the app.
const MAX_HITS: usize = 100;
const MAX_MATCHES: usize = 2_000;
const MAX_VISITED: usize = 200_000;

/// Finds files under `root` whose path contains every word of `query` (any
/// order, ignoring case), best matches first: names that start with a word, then
/// names that contain it, then files that only match through their folders.
/// Hidden files are skipped unless `show_hidden`; `.git` and the folders named in
/// `hidden_folders` are never searched. Symlinked folders aren't followed.
fn search_walk(root: &Path, query: &str, show_hidden: bool, hidden_folders: &[String]) -> Vec<SearchHit> {
    let terms: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    if terms.is_empty() {
        return Vec::new();
    }
    let mut matches: Vec<(usize, SearchHit)> = Vec::new();
    // Breadth-first, so files near the top of the project are found before deep ones.
    let mut queue = std::collections::VecDeque::from([root.to_path_buf()]);
    let mut visited = 0usize;
    'walk: while let Some(dir) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_VISITED || matches.len() >= MAX_MATCHES {
                break 'walk;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') && !show_hidden {
                continue;
            }
            let path = entry.path();
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                if name != ".git" && !hidden_folders.contains(&name) {
                    queue.push_back(path);
                }
                continue;
            }
            if kind.is_symlink() && !std::fs::metadata(&path).map(|m| m.is_file()).unwrap_or(false) {
                continue;
            }
            let Ok(relative) = path.strip_prefix(root) else { continue };
            let relative_text = relative.to_string_lossy().replace('\\', "/");
            let haystack = relative_text.to_lowercase();
            if !terms.iter().all(|t| haystack.contains(t.as_str())) {
                continue;
            }
            let lower_name = name.to_lowercase();
            let score: usize = terms
                .iter()
                .map(|t| if lower_name.starts_with(t.as_str()) { 0 } else if lower_name.contains(t.as_str()) { 1 } else { 2 })
                .sum();
            let dir = relative
                .parent()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            matches.push((score, SearchHit { name, path: path.to_string_lossy().into_owned(), dir }));
        }
    }
    matches.sort_by(|(sa, a), (sb, b)| {
        sa.cmp(sb)
            .then_with(|| a.name.len().cmp(&b.name.len()))
            .then_with(|| a.dir.len().cmp(&b.dir.len()))
            .then_with(|| a.path.cmp(&b.path))
    });
    matches.truncate(MAX_HITS);
    matches.into_iter().map(|(_, hit)| hit).collect()
}

/// Searches a project folder for files by name; see `search_walk`.
#[tauri::command]
async fn search_files(
    root: String,
    query: String,
    show_hidden: bool,
    hidden_folders: Vec<String>,
) -> Result<Vec<SearchHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_walk(Path::new(&root), &query, show_hidden, &hidden_folders)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Reads a file as UTF-8 text. Files with NUL bytes, invalid UTF-8 or over
/// `max_size` bytes (default `MAX_TEXT_SIZE`) are reported as external, so they
/// are never edited and saved back corrupted.
#[tauri::command]
fn read_file(path: String, max_size: Option<u64>) -> Result<FileContent, String> {
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > max_size.unwrap_or(MAX_TEXT_SIZE) {
        return Ok(FileContent::External);
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes[..bytes.len().min(8000)].contains(&0) {
        return Ok(FileContent::External);
    }
    match String::from_utf8(bytes) {
        Ok(text) => Ok(FileContent::Text {
            text: text.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(text),
        }),
        Err(_) => Ok(FileContent::External),
    }
}

#[tauri::command]
fn open_in_default_app(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Saves a pasted or dropped image into an `assets` folder next to the document
/// and returns the path to use in the markdown, relative to the document.
/// The raw image bytes are the request body; the document path and the original
/// file name come in URI-encoded headers.
#[tauri::command]
fn save_asset(request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw image bytes".into());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(percent_decode)
            .ok_or_else(|| format!("missing header {name}"))
    };
    let doc_path = PathBuf::from(header("x-doc-path")?);
    let file_name = header("x-file-name")?;

    let doc_dir = doc_path.parent().ok_or("document has no folder")?;
    // The folder name is a preference; it must be a plain name, not a path.
    let folder = header("x-assets-dir").unwrap_or_else(|_| "assets".into());
    let valid = !folder.is_empty()
        && folder != "."
        && folder != ".."
        && !folder.contains(['/', '\\'])
        && Path::new(&folder).components().count() == 1;
    if !valid {
        return Err(format!("\"{folder}\" is not a valid folder name"));
    }
    let assets_dir = doc_dir.join(&folder);
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    let original = Path::new(&file_name);
    let stem: String = original
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let ext = original.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let name = format!("{stem}-{stamp}.{ext}");

    std::fs::write(assets_dir.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(format!("{folder}/{name}"))
}

/// Watches a folder recursively and emits `fs-change` with the changed paths.
#[tauri::command]
fn watch_folder(app: AppHandle, state: State<AppState>, path: String) -> Result<(), String> {
    let mut slot = state.watcher.lock().unwrap();
    *slot = None;
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let paths: Vec<String> =
            event.paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let _ = app.emit("fs-change", paths);
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(Path::new(&path), RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    *slot = Some(watcher);
    Ok(())
}

/// The app's own folder in the user's home: `~/.margin/`.
fn margin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home.join(".margin"))
}

/// Where per-project settings live: `~/.margin/projects/`.
fn projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(margin_dir(app)?.join("projects"))
}

fn read_if_exists(path: PathBuf) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// The user's preferences (JSON), from `~/.margin/settings.json`.
#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Option<String>, String> {
    read_if_exists(margin_dir(&app)?.join("settings.json"))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let dir = margin_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("settings.json"), settings).map_err(|e| e.to_string())
}

/// The recently opened projects and files (JSON), from `~/.margin/recent.json`.
#[tauri::command]
fn load_recent(app: AppHandle) -> Result<Option<String>, String> {
    read_if_exists(margin_dir(&app)?.join("recent.json"))
}

#[tauri::command]
fn save_recent(app: AppHandle, recent: String) -> Result<(), String> {
    let dir = margin_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("recent.json"), recent).map_err(|e| e.to_string())
}

/// A project's settings file: the folder's name plus a hash of its full path,
/// so two folders with the same name don't share settings.
fn project_file(app: &AppHandle, folder: &str) -> Result<PathBuf, String> {
    // FNV-1a: stable across runs and Rust versions, unlike `DefaultHasher`.
    let hash = folder
        .bytes()
        .fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
    let name: String = Path::new(folder)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project")
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    Ok(projects_dir(app)?.join(format!("{name}-{hash:016x}.json")))
}

/// Reads a project's saved settings (JSON), or nothing if it has none yet.
#[tauri::command]
fn load_project_settings(app: AppHandle, folder: String) -> Result<Option<String>, String> {
    read_if_exists(project_file(&app, &folder)?)
}

#[tauri::command]
fn save_project_settings(app: AppHandle, folder: String, settings: String) -> Result<(), String> {
    std::fs::create_dir_all(projects_dir(&app)?).map_err(|e| e.to_string())?;
    std::fs::write(project_file(&app, &folder)?, settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn print_page(webview: tauri::Webview) -> Result<(), String> {
    webview.print().map_err(|e| e.to_string())
}

#[tauri::command]
fn take_pending_opens(state: State<AppState>) -> Vec<String> {
    std::mem::take(&mut *state.pending_opens.lock().unwrap())
}

/// Markdown files passed on the command line (how Windows and Linux hand over
/// "Open with" / double-clicked files).
fn files_from_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

fn open_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    app.state::<AppState>().pending_opens.lock().unwrap().extend(files.iter().cloned());
    let _ = app.emit("open-files", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let files = files_from_args(argv.into_iter().skip(1), Path::new(&cwd));
            open_files(app, files);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .manage(terminal::Terminals::default())
        .setup(|app| {
            let cwd = std::env::current_dir().unwrap_or_default();
            let files = files_from_args(std::env::args().skip(1), &cwd);
            app.state::<AppState>().pending_opens.lock().unwrap().extend(files);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir,
            search_files,
            read_file,
            write_file,
            open_in_default_app,
            path_exists,
            save_asset,
            watch_folder,
            print_page,
            take_pending_opens,
            load_project_settings,
            save_project_settings,
            load_recent,
            save_recent,
            load_settings,
            save_settings,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            app.state::<terminal::Terminals>().kill_all();
        }

        // macOS delivers double-clicked / "Open with" files as an event instead of arguments.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            let files = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            open_files(app, files);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch folder with the given files (relative paths), removed on drop.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str, files: &[&str]) -> Self {
            let root = std::env::temp_dir().join(format!("margin-test-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            for file in files {
                let path = root.join(file);
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(path, "x").unwrap();
            }
            Scratch(root)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn names(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(|h| h.path.rsplit(['/', '\\']).next().unwrap()).collect()
    }

    const FILES: &[&str] = &[
        "README.md",
        "docs/readme-draft.md",
        "docs/notes/Plan.md",
        "src/main.rs",
        "src/deep/er/readme.txt",
        ".hidden/secret.md",
        ".env",
        "node_modules/pkg/readme.md",
        ".git/config",
    ];

    #[test]
    fn matches_any_case_and_ranks_names_first() {
        let scratch = Scratch::new("rank", FILES);
        let hits = search_walk(&scratch.0, "README", false, &["node_modules".into()]);
        // The name that starts with the word comes first, then the one that only contains it.
        assert_eq!(names(&hits), ["README.md", "readme.txt", "readme-draft.md"]);
    }

    #[test]
    fn all_words_must_match_in_any_order() {
        let scratch = Scratch::new("words", FILES);
        let hits = search_walk(&scratch.0, "md docs", false, &[]);
        assert_eq!(names(&hits), ["Plan.md", "readme-draft.md"]);
        // A word can match a folder name rather than the file's name.
        let hits = search_walk(&scratch.0, "notes plan", false, &[]);
        assert_eq!(names(&hits), ["Plan.md"]);
    }

    #[test]
    fn skips_hidden_files_and_hidden_folders() {
        let scratch = Scratch::new("hidden", FILES);
        let hits = search_walk(&scratch.0, "md", false, &["node_modules".into()]);
        assert!(names(&hits).iter().all(|n| *n != "secret.md"));
        assert!(hits.iter().all(|h| !h.path.contains("node_modules")));
        let shown = search_walk(&scratch.0, "secret", true, &[]);
        assert_eq!(names(&shown), ["secret.md"]);
        // .git is never searched, even when hidden files are shown.
        assert!(search_walk(&scratch.0, "config", true, &[]).is_empty());
    }

    #[test]
    fn reports_the_folder_relative_to_the_root() {
        let scratch = Scratch::new("dirs", FILES);
        let hits = search_walk(&scratch.0, "main.rs", false, &[]);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].dir, "src");
        let root_hit = search_walk(&scratch.0, "README.md", false, &[]);
        assert_eq!(root_hit[0].dir, "");
    }

    #[test]
    fn empty_queries_and_missing_folders_return_nothing() {
        let scratch = Scratch::new("empty", FILES);
        assert!(search_walk(&scratch.0, "   ", false, &[]).is_empty());
        assert!(search_walk(&scratch.0.join("missing"), "md", false, &[]).is_empty());
    }
}
