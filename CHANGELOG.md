### 1.3.1 (2026-11-27)

* Fixed:
  * The language server no longer fails with `couldn't create connection to server` / `command 'lua.removeSpace' already exists`. Two causes, both fixed: VS Code commands are a global namespace, so a same-named command registered by another Lua extension used to abort the whole client start-up; and restarting while the client was still starting dropped the handle and leaked a client that kept its commands registered, which made every later start fail until the window was reloaded. A command-name collision now only skips that one command; start/stop/restart are serialized.
  * The simulator's output now goes to the **CLX Emulator** output channel. It used to be captured but never forwarded, so anything the emulator printed — including its one-line ROM failures — only reached the DevTools console.
* New:
  * `CLX: Build ROM` (**Windows only**) writes `<file>.clx.rom` next to the cartridge using the emulator's own `-b` flag. The macOS emulator build enables `COLOX_AUTO_GEN_ROM` and writes the ROM by itself when it loads a cartridge; the official Windows build does not enable it, so it never did. That is a compile-time difference between the two packages, not a launcher problem — which is why a plain run on Windows produced no `.rom`. The command is hidden on macOS, where no argument can turn the automatic generation off. It is a command rather than a setting because a "generate the ROM automatically" toggle could only ever be truthful on one of the two platforms, and it is not something you want happening on every run by default.
  * That macro also gates the memory-layout block (`sprites:00000 map:24900 …`) and the source-line printout on errors. Their absence in the Windows emulator's output is the same cause, not a fault.

### 1.3.0 (2026-11-27)

* Breaking:
  * **Java is no longer required.** The language server is now [LuaLS](https://github.com/LuaLS/lua-language-server) instead of a modified EmmyLua jar. If you installed a JDK only for this extension, you can remove it.
  * The `clx-language.JAVA_HOME` setting is gone, along with the five `clx-language.colors.*` settings. Custom colours now go through VS Code's standard `editor.semanticTokenColorCustomizations`.
  * The upvalue underline is gone. LuaLS does not distinguish upvalues from ordinary variables, and reconstructing that needs a scope analysis of our own.
  * A `.luarc.json` in your workspace no longer affects `.clx` files. The extension supplies its own configuration so behaviour is the same everywhere.
* Changed:
  * The language server is downloaded once (~1 MB) into the extension's global storage on first use. It happens in the background with a status bar indicator; there is no dialog. Syntax highlighting works immediately and does not wait for it.
  * The extension package went from 8.71 MB to 193 KB (−97.8%).
  * CLX stubs now match the real dialect. CLX runs a customized **Lua 5.4** (32-bit numerics), so `os` and `io` are marked as unavailable (time is `stat(90..96)`, files are `__resread`/`__reslist`), `load` is declared as `loads`, and the five conversion helpers (`tostr`, `tonum`, `chr`, `ord`, `split`) are documented.
  * Stubs reorganized into `res/clx-std/{en,zh}` (CLX built-ins) and `res/clx-lua/{en,zh}` (dialect differences). The old Lua 5.1 standard-library stubs were removed; the standard library now comes from LuaLS's own Lua 5.4 definitions.
  * Stub coverage synced against the official coloX documentation (platform version 14). The previously missing APIs are now declared: `flip`, `wline`, `bezier`, `rectcls`, the whole `pad_*` gamepad set, `micpoll`, `svcget`/`svcadd`/`svcset`/`svcreq`/`svcmon`, `toidle`/`tofg`, `t`, `compress`/`decompress`, the MD5/SHA-1/Base64 helpers, `usemod`, `__cartinfo`/`__resread`/`__reslist`/`__getbioserror`, the air-image stream (`img_airinfo`/`img_loadair`/`img_scrair`), `img_loadscr`/`img_set_flag`/`img_webpani_*`, and the `cjson` configuration functions. All 11 lifecycle callbacks are declared as well.
* New:
  * `#include`, `#blob` and `#png` now complete file paths from the directory of the `.clx` file. Both files and subdirectories are offered.
  * Signature help, parameter-name hints and semantic highlighting now work — these were not available before.
  * `os` and `io` completions no longer appear, so the editor stops suggesting APIs that do not exist in CLX.
* Fixed:
  * `.clx` files no longer produce a screen full of syntax errors for the header and the `__gfx__`/`__map__` resource sections. The non-Lua sections are turned into comments of identical width, so line numbers are unchanged.
* Dependencies:
  * `server/lua_ls.jar` (9.0 MB, EmmyLua-LanguageServer 0.5.16) removed.
  * LuaLS 3.19.2 added as a downloaded artifact, trimmed from 21 MB to ~4.3 MB unpacked (`meta/` is 17 MB of Unity/.NET bindings and third-party frameworks that have nothing to do with CLX).

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
