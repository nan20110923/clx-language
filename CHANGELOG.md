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
