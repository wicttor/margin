//! Terminals: each one is a shell running in a pseudo-terminal (ConPTY on
//! Windows), streamed to an xterm.js view in the frontend.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals {
    sessions: Mutex<HashMap<u32, Session>>,
    next_id: AtomicU32,
}

impl Terminals {
    /// Ends every shell; called when the app quits.
    pub fn kill_all(&self) {
        for session in self.sessions.lock().unwrap().values_mut() {
            let _ = session.killer.kill();
        }
    }
}

/// The user's shell: their login shell on macOS and Linux; on Windows,
/// PowerShell 7 or Windows PowerShell when present, otherwise cmd.exe.
fn shell_command() -> CommandBuilder {
    #[cfg(windows)]
    {
        let on_path = |exe: &str| {
            std::env::var_os("PATH")
                .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join(exe).is_file()))
                .unwrap_or(false)
        };
        for exe in ["pwsh.exe", "powershell.exe"] {
            if on_path(exe) {
                let mut cmd = CommandBuilder::new(exe);
                cmd.arg("-NoLogo");
                return cmd;
            }
        }
    }
    CommandBuilder::new_default_prog()
}

/// Starts a shell and streams its output to `output`: raw bytes while it runs,
/// then `{"exit": code}` once it has ended. Returns the terminal's id.
/// `shell` (a preference) replaces the default shell when set.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<Terminals>,
    cwd: Option<String>,
    shell: Option<String>,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    output: Channel<InvokeResponseBody>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = match shell.filter(|s| !s.trim().is_empty()) {
        Some(program) => {
            let mut cmd = CommandBuilder::new(program.trim());
            cmd.args(&args);
            cmd
        }
        None => shell_command(),
    };
    let dir = cwd
        .filter(|d| std::path::Path::new(d).is_dir())
        .or_else(|| app.path().home_dir().ok().map(|p| p.to_string_lossy().into_owned()));
    if let Some(dir) = dir {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Margin");

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The shell holds its own handle; ours would keep the terminal open after it exits.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state
        .sessions
        .lock()
        .unwrap()
        .insert(id, Session { master: pair.master, writer, killer });

    // Waits for the shell to end, then drops the session. Closing our end of the
    // pseudo-terminal is what ends the reader below on Windows.
    let waiter = std::thread::spawn(move || {
        let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
        app.state::<Terminals>().sessions.lock().unwrap().remove(&id);
        code
    });

    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if output.send(InvokeResponseBody::Raw(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
        let code = waiter.join().unwrap_or(1);
        let _ = output.send(InvokeResponseBody::Json(format!("{{\"exit\":{code}}}")));
    });

    Ok(id)
}

#[tauri::command]
pub fn terminal_write(state: State<Terminals>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("terminal has ended")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(state: State<Terminals>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("terminal has ended")?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_kill(state: State<Terminals>, id: u32) -> Result<(), String> {
    if let Some(session) = state.sessions.lock().unwrap().get_mut(&id) {
        session.killer.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}
