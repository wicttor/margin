# Contributing to Margin

Thanks for helping. Bug reports, fixes, features and docs are all welcome.

## Before you start

- **Bugs:** open an issue with the steps to reproduce it. Check the existing
  issues first.
- **Features:** open an issue to discuss the idea before writing a large
  change. Margin aims to stay small, so not every feature will fit.
- **Security issues:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Setting up

Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for
your OS: Rust, Node.js 20+, and on Linux the WebKitGTK development packages.
Then:

```sh
npm install
npm run tauri dev
```

The project layout is described in the [README](README.md#project-layout).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change. Small pull requests are reviewed
   faster.
3. Add or update tests where the change can be tested.
4. Run the checks that CI runs:
   ```sh
   npm run check
   npm run build
   cd src-tauri && cargo fmt --check && cargo check
   ```
5. Update the README if the change affects features, shortcuts or building.
6. Add yourself to [CONTRIBUTORS.md](CONTRIBUTORS.md) if you'd like to be
   listed.

## Commit messages

Write the first line as a short summary in the imperative, for example
"Add file search above the file tree". If more context helps, add a blank
line and explain what changed and why.

## License

By contributing, you agree that your work is released under the
[MIT License](LICENSE).
