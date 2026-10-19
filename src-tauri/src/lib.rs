mod terminal;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Files larger than this open in the system's default app instead of the editor.
const MAX_TEXT_SIZE: u64 = 20 * 1024 * 1024;
/// Folders left out of the tree: they are rarely browsed and can be huge.
const SKIPPED_FOLDERS: &[&str] = &["node_modules", "__pycache__"];

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
/// Hidden entries are left out.
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let path = entry.path();
            // `metadata` follows symlinks, so linked folders show up as folders.
            let is_dir = std::fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
            if is_dir && SKIPPED_FOLDERS.contains(&name.as_str()) {
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

/// Reads a file as UTF-8 text. Files with NUL bytes, invalid UTF-8 or over
/// `MAX_TEXT_SIZE` are reported as external, so they are never edited and saved
/// back corrupted.
#[tauri::command]
fn read_file(path: String) -> Result<FileContent, String> {
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_TEXT_SIZE {
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
    let assets_dir = doc_dir.join("assets");
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
    Ok(format!("assets/{name}"))
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
            read_file,
            write_file,
            open_in_default_app,
            path_exists,
            save_asset,
            watch_folder,
            print_page,
            take_pending_opens,
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
