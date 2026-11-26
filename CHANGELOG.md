### 1.2.0 (2026-11-26)

* Breaking:
  * The minimum supported VS Code version is now 1.91.0, raised from 1.80.0. Users on 1.80–1.90 will stay on 1.1.0; the Marketplace does not offer them this version.
* Changed:
  * Debugging now sets breakpoints on your original `.clx` file instead of generating a `debug_temp.clx` copy. Line numbers are calibrated against the source the emulator actually loaded, so they stay correct even with `#include`.
  * Source layout reorganized into `src/language/`, `src/emulator/` and `src/debug/`.
* New:
  * The call stack is read from the emulator, so stack frames and frame selection work.
  * Conditional breakpoints are supported.
  * The Debug Console forwards input to the emulator, and the Globals scope is populated.
  * Variables and expressions can be edited from the Variables panel and the Debug Console.
  * Test automation: `CLX Test` commands inject buttons, mouse, and keyboard input, take screenshots, and show the input state. The same commands are available in the Debug Console behind a `!` prefix, for example `!btn LEFT 30`.
  * Screenshots go to the extension's own storage, never next to your source files, and report the pixel md5 for diffing.
  * `yarn test` now runs real tests over the debug protocol parsing and line mapping.
  * `yarn lint` works (the repository previously had no ESLint configuration).
* Dependencies:
  * `vscode-languageclient` 8.0.2 → 11.0.1, `@vscode/debugadapter` and `@vscode/debugprotocol` 1.61.0 → 1.68.0, `typescript` 4.9.5 → 5.9.3, `esbuild` 0.14.54 → 0.28.2, `eslint` 8.49.0 → 10.15.0.
  * `tsconfig.json` now uses `module`/`moduleResolution` `node16`, required by the language client's package exports.
* Bug Fixed:
  * The annotation renderer could append to an undefined range list for an unexpected annotator type.
  * Stopping a debug session now actually terminates the emulator; previously the process was left running.
* Known limitation:
  * The Locals scope cannot be populated: the emulator's `i local` command reports the wrong stack frame. Use `p <name>` in the Debug Console, which resolves locals and upvalues correctly.

### 1.1.0 (2026-11-26)

* Changed:
  * The ColoX emulator is no longer bundled with the extension. It is downloaded once on first run into the extension's global storage, taking the VSIX from 34.5 MB down to 8.3 MB. Offline users can point `clx-language.debuggerCustomPath` at a local copy of the emulator instead.
  * The bundled emulator has been updated from the 2024 build to the official 2026-11-19 release.
  * Device specifications are no longer enumerated by the extension. New ones such as `coloX-PICO8` work without an extension update.
  * The `Nature` debugger option is deprecated: Nature is no longer published separately and is handled by the same binary. Selecting it behaves like `Default`.
  * README images moved to `static/readme/` and are no longer packaged.

### 1.0.18 (2026-11-25)

* Bug Fixed:
  * The simulator is now launched with an argument array instead of a shell command string, so paths containing spaces work on Windows.
* Maintenance:
  * The project has moved to GitHub. Releases are now published automatically by GitHub Actions.

### 1.0.17 (2025-08-29)

* Bug Fixed:
  * The emulator fails to run properly when the working directory path contains spaces.

### 1.0.16 (2024-09-04)

* Update emulator

### 1.0.15 (2024-06-04)

* Update emulator
* Update documents

### 1.0.14 (2024-02-06)

* Bug Fixed:

  * Not generate rom file automatically on windows platform

### 1.0.13 (2023-12-11)

* Update macos platform emulator

### 1.0.12 (2023-11-03)

* README.md add usage
* Optimize debugger connection
* Update windows platform emulator

### 1.0.10 (2023-10-30)

* Update macos platform emulator
* Bug Fixed:

  * Windows platform emulator failed to start

### 1.0.7 (2023-10-16)

* Add Nature debugger
* Support #blob assign syntax
* Bug Fixed:
  * Incorrect comment symbols

### 1.0.3 (2023-10-08)

- Add English documents
- Fixed a few bugs
