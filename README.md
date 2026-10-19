# Margin

A small desktop markdown editor where the document is
rendered as you type, with a folder tree on the left, tabs for open files and
a print button. Nothing else.

Built with [Tauri 2](https://tauri.app) (Rust) and Svelte, using
[Milkdown](https://milkdown.dev) for WYSIWYG editing.

## Features

- **WYSIWYG editing**: headings, lists, task lists, tables, code blocks with
  syntax highlighting, math (KaTeX), links and images render in place.
- **Source mode** (`Ctrl+/`, `⌘/` on macOS) for editing the raw markdown.
- **Any text file**: CSS, C++, PHP, Python, JSON and 100+ other languages
  open in a code editor with syntax highlighting, line numbers, folding and
  search (`Ctrl+F`). They're saved exactly as written.
- **Binary files** (images, PDFs, archives…) and files over 20 MB open in your
  system's default app.
- **Folder tree** of a folder's files and sub-folders. Double-click a file
  (or select it and press Enter) to open it. Hidden files and
  `node_modules` are left out. It updates when files change on disk.
- **File search** above the tree (`Ctrl+Shift+F`): finds files by name anywhere
  in the project, including folders you haven't expanded. Words can be in any
  order (`read md` finds `README.md`), and they can match folder names too
  (`docs plan`). Results replace the tree while you type, with the best
  matches first. Use `↑`/`↓` and `Enter` to open one, and `Esc` to clear.
  Hidden files and the folders hidden in Preferences are skipped.
- **Tabs**: a dot marks unsaved changes. You're asked before unsaved work is
  closed. Right-click a tab for more options.
- **Print** button (`Ctrl+P`). To make a PDF, pick "Save as PDF" in your
  system's print dialog. Code prints with syntax highlighting.
- **Images**: relative paths like `assets/pic.png` display correctly. Pasted
  images are saved into an `assets/` folder next to the document.
- **Links**: `Ctrl`/`⌘`+click a link to open it. Links to other `.md` files
  open in a new tab.
- **Terminals**: open as many as you like from the *Terminals* section at
  the bottom of the sidebar (or `` Ctrl+Shift+` ``). The first one splits the
  window, with documents on top and the terminal below. Drag the divider to
  resize it. Only the current terminal is shown; click one in the sidebar to
  switch. Hiding the terminal area (`` Ctrl+` ``) keeps the shells running, and
  typing `exit` closes a terminal. The shell is your default one (PowerShell on
  Windows when installed) and starts in the open folder.
- **Projects**: opening a folder (sidebar button, main menu, or dropping it on
  the window) closes the previous folder's documents, asking first about
  unsaved changes. Each project remembers its open files, the active tab and
  the expanded tree folders in `~/.margin/projects/`, and gets them back the
  next time you open it, including when the app starts.
- **Open Recent** (`Ctrl+R`, also in the main menu) lists recently opened
  folders and files, kept in `~/.margin/recent.json`. When no document is
  open, the window shows the project's recent files and your recent folders;
  with no folder open, it suggests opening one.
- **Opening files**: double-click a `.md` file once the app is installed
  (file association), or drop files or a folder on the window.
- **Preferences** (`Ctrl+,`, in the main menu): theme (system, light, dark),
  compact spacing, separate interface and document text sizes, document and
  code fonts, color vision modes for red–green and blue–yellow color
  blindness, and options for every behavior: the file tree, projects and
  history, both editors, terminals (shell, colors including GitHub's
  colorblind and tritanopia themes, cursor, scrollback) and printing. Changes
  apply immediately and are saved to `~/.margin/settings.json`.

## Design

The interface follows the [GNOME Human Interface Guidelines](https://developer.gnome.org/hig/)
and uses libadwaita's colors, type scale and widget styles, implemented in CSS
so it looks the same on Windows, macOS and Linux:

- **Header bars** instead of a system title bar. They hold the window
  buttons, a centered window title and the main menu. On macOS the native
  traffic-light buttons sit in the header bar.
- **Split view** with a sidebar for the folder tree, a tab bar like
  `AdwTabBar`, and empty-state pages like `AdwStatusPage`.
- **In-app dialogs and toasts** like `AdwAlertDialog` and `AdwToast`,
  instead of system message boxes. File pickers stay native.
- A **main menu** with access keys, plus *Keyboard Shortcuts* and *About*
  dialogs.
- **Light and dark** styles, following the system, and a high-contrast
  variant.

Colors and metrics live as CSS variables in `src/app.css`, named like
libadwaita's own (`--accent-bg-color`, `--headerbar-bg-color`, …). The UI font
is Inter, which GNOME's Adwaita Sans is based on. It's bundled, so it's the
same on every OS.

## Keyboard shortcuts

On macOS, use `⌘` instead of `Ctrl`. All shortcuts are also listed in the app
under **Main Menu → Keyboard Shortcuts** (`Ctrl+?`).

| Action                 | Shortcut                                  |
| ---------------------- | ----------------------------------------- |
| New document / new tab | `Ctrl+N` / `Ctrl+T`                       |
| Open file / folder     | `Ctrl+O` / `Ctrl+Shift+O`                 |
| Open recent            | `Ctrl+R`                                  |
| Find a file in the project | `Ctrl+Shift+F`                        |
| Save / Save as         | `Ctrl+S` / `Ctrl+Shift+S`                 |
| Close tab              | `Ctrl+W` (or middle-click)                |
| Next / previous tab    | `Ctrl+Page Down` / `Ctrl+Page Up`, `Ctrl+Tab` |
| Go to tab 1–9          | `Alt+1` … `Alt+9`                         |
| Markdown source mode   | `Ctrl+/` (in code files: toggle comment)  |
| Show / hide sidebar    | `F9`                                      |
| New terminal           | `` Ctrl+Shift+` ``                            |
| Show / hide terminals  | `` Ctrl+` ``                                  |
| Copy / paste in a terminal | `Ctrl+Shift+C` / `Ctrl+Shift+V` (`⌘C` / `⌘V` on macOS) |
| Preferences            | `Ctrl+,`                                  |
| Main menu              | `F10`                                     |
| Print                  | `Ctrl+P`                                  |

## Development

Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for
your OS first: Rust, Node.js 20+, and on Linux the WebKitGTK development
packages. Then:

```sh
npm install
npm run tauri dev
```

## Building installers

Tauri builds installers for the OS it runs on. Run this on each platform:

```sh
npm run tauri build
```

Output goes to `src-tauri/target/release/bundle/`:

| OS      | Installers                                    | Build on              |
| ------- | --------------------------------------------- | --------------------- |
| Windows | `msi/*.msi`, `nsis/*-setup.exe`               | Windows 10/11         |
| Linux   | `appimage/*.AppImage`, `deb/*.deb`, `rpm/*.rpm` | Ubuntu 22.04 or older (see below) |
| macOS   | `dmg/*.dmg`, `macos/*.app`                    | macOS (Intel or Apple Silicon) |

To build only some formats, list them, for example:
`npm run tauri build -- --bundles appimage,deb`.

### Notes per platform

- **Linux:** an AppImage only runs on systems with the same or a newer glibc
  than the system it was built on, so build on the oldest distro you want to
  support. The AppImage is large (~80 MB) because it includes WebKitGTK. The
  `.deb` and `.rpm` are ~4 MB because they use the system's copy.
- **macOS:** for a single `.dmg` that runs on both Intel and Apple Silicon:
  ```sh
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  npm run tauri build -- --target universal-apple-darwin
  ```
  Without signing and notarization (Apple Developer account, $99/yr),
  people opening the app see an "unidentified developer" warning. They need to
  right-click the app and choose **Open** the first time.
- **Windows:** unsigned installers show a SmartScreen warning ("More info →
  Run anyway"). Signing the installer with a code-signing certificate removes
  it.
- **Windows from Linux (experimental):** Tauri can cross-compile the NSIS
  `.exe` installer (not the `.msi`):
  ```sh
  cargo install --locked cargo-xwin
  rustup target add x86_64-pc-windows-msvc
  sudo apt install nsis lld llvm
  npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc
  ```

## Signing the Windows installer

Unsigned installers work, but Windows shows a SmartScreen warning. The project
is set up for [Azure Artifact Signing](https://learn.microsoft.com/azure/trusted-signing/quickstart)
(formerly "Trusted Signing"), which individual developers in the USA and
Canada can use for about US$10/month.

### One-time setup in Azure

1. Create a **pay-as-you-go** Azure subscription. Free and sponsored
   subscriptions don't work.
2. Create an **Artifact Signing account**. Note its **name** and **region**.
3. Complete **identity validation** as an individual (government ID and a
   selfie). This can take a few days.
4. Create a **certificate profile** of type *Public Trust*. Note its name.
5. Create an **App Registration** in Microsoft Entra ID. Give it a client
   secret, and on the signing account give it the role
   *Artifact Signing Certificate Profile Signer*.

### On the Windows build machine

1. Install the Windows 11 SDK (for `signtool`), .NET 8 and the Azure CLI.
2. Install the signing tool: `cargo install artifact-signing-cli`
3. Set the App Registration's credentials as environment variables:
   `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.
   Don't commit these.
4. In `src-tauri/tauri.signing.conf.json`, replace `REGION`, `ACCOUNT_NAME`
   and `CERTIFICATE_PROFILE` with your values. For the region, use the
   account's endpoint, for example `https://eus.codesigning.azure.net` for
   East US.
5. Build with signing:
   ```sh
   npm run tauri build -- --config src-tauri/tauri.signing.conf.json
   ```
   The app, the `.msi` and the setup `.exe` are all signed. To check, open
   the installer's **Properties → Digital Signatures**.

Normal `npm run tauri build` stays unsigned, so builds keep working without
the Azure setup.

## Project layout

```
src/                     Svelte frontend
  routes/+page.svelte    window layout, tabs, shortcuts, session
  lib/Editor.svelte      one editor per tab (Milkdown + CodeMirror source mode)
  lib/codemirror.ts      code editor setup, languages, printable highlighting
  lib/TreeNode.svelte    folder tree
  lib/FileSearch.svelte, lib/SearchResults.svelte  file search above the tree
  lib/recent.svelte.ts   recently opened folders and files
  lib/settings.svelte.ts preferences: defaults, saving, applying the appearance
  lib/PreferencesDialog.svelte  the Preferences dialog
  lib/terminalThemes.ts  terminal colors (GNOME and GitHub)
  lib/RecentDialog.svelte, lib/RecentList.svelte  Open Recent and the empty window's lists
  lib/TerminalView.svelte  one terminal (xterm.js)
  lib/terminals.svelte.ts  open terminals and the terminal area's state
  lib/ui/                GNOME-style widgets: menus, dialogs, toasts, window buttons, icons
  lib/state.svelte.ts    tabs and tree state
  lib/api.ts             calls into Rust, path helpers
  app.css                libadwaita colors and widget styles, document and print styles
src-tauri/
  src/lib.rs             file access, file search, folder watching, image saving, printing
  src/terminal.rs        shells in pseudo-terminals (ConPTY on Windows)
  tauri.conf.json        window, bundling and file associations
  tauri.macos.conf.json  macOS window: native buttons over the header bar
```

## Known limitations

- On save, the editor writes the document in its own consistent markdown style
  (for example `-` for bullets and `*emphasis*`). The content is unchanged, but
  the diff of a hand-formatted file can be noisy the first time you save it.
- Images pasted into a new document go into `assets/` only after the document
  has been saved once.

## License

[MIT](LICENSE). See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the people who
built Margin.
