# Clx-language

[🌐中文](https://github.com/nan20110923/clx-language/blob/main/README_zh.md)

## Introduction

Develop CLX programs — Lua with extended syntax — for ColoPlay devices made by
Lifesmart, without leaving VS Code.

- Syntax highlighting and completion for CLX
- Inline documentation for the ColoX built-in API
- Run a cartridge in the ColoX emulator
- Breakpoint debugging, driven from VS Code

## Installation

Install **clx-language** from the VS Code Marketplace and open any `.clx` file.
That is all — no toolchain, no environment variables, nothing to configure.

Two things download themselves the first time they are needed, into VS Code's
per-extension storage, shared by every workspace:

| What | When | Size |
|---|---|---|
| Language server (LuaLS) | First `.clx` file you open | ~1 MB |
| ColoX emulator | First time you run a file | ~5 MB |

Both happen in the background with progress in the status bar. Syntax
highlighting works immediately and never waits for a download. If a download
fails, you lose the corresponding feature and the problem is logged to the
**CLX Language Server** output channel — editing and highlighting keep working.

## What CLX runs

CLX is a customized **Lua 5.4** with 32-bit numerics. A few things differ from
stock Lua in ways that will bite you if you assume otherwise:

- `os` and `io` **do not exist.** For time use `stat(90..96)`; for files use
  `__resread` / `__reslist`.
- `print` draws text on the screen, it does not write to a console. Use
  `printh` for console output.
- `load` is renamed **`loads`** — the name `load` belongs to CLX's own
  cartridge-loading API.
- `dofile` and `loadfile` exist but raise if called.

The extension's completions reflect all of this, so `os` and `io` will not be
suggested to you.

## Configuration

| Setting | Values | Meaning |
|---|---|---|
| `clx-language.debugger` | `Default` | Use the emulator the extension downloads (recommended) |
| | `Custom` | Use the program at `debuggerCustomPath`, never download |
| `clx-language.debuggerCustomPath` | path | Only read when `debugger` is `Custom` |

`Nature` is still accepted for compatibility but behaves like `Default` — the
Nature emulator is no longer published separately.

### Working without internet access

If your network cannot reach GitHub Releases, get the emulator yourself and
point the extension at it:

1. Set `clx-language.debugger` to `Custom`.
2. Download the emulator from the
   [ColoX documentation page](https://x.cololight.com/mweb/docs/examples).
3. Set `clx-language.debuggerCustomPath` to the executable:
   - **macOS**: `coloXtool.app/Contents/MacOS/coloXtool` — keep the whole `.app`
     directory next to it
   - **Windows**: `coloXtool.exe` — keep the sibling DLLs

If macOS refuses to open it ("cannot be opened because the developer cannot be
verified"), the file has a quarantine attribute. Clear it once:

```bash
xattr -d com.apple.quarantine /path/to/coloXtool.app
```

An emulator downloaded by the extension never has this problem.

The language server still needs internet, but it is optional: without it you
keep syntax highlighting, and everything else in this page works.

## Usage

### Create a cartridge

Create a file with a `.clx` extension and type `template`. The snippet expands
to a complete cartridge skeleton — device specification line, the Lua section,
and the resource sections.

The first line must name a device specification such as `coloX-4P`,
`coloX-16` or `coloX-PICO8`. The emulator reads that line to decide screen size
and capabilities; the extension does not keep a list, so new specifications
work as soon as the emulator supports them.

### Run it

With the cursor in a `.clx` file, click the **Run** button in the editor title
bar, or press <kbd>F5</kbd>. The emulator opens and loads the cartridge.

You will also see a `<name>.clx.rom` file appear next to your source. That file
is the emulator's compiled output — **it is the reliable sign that the cartridge
actually loaded.** If the emulator window opens but that file is missing,
loading failed (usually a syntax error in the header) and the emulator silently
fell back to its menu.

### Debug it

1. Switch to **Run and Debug** in the sidebar and start the `CLX Debugger`
   configuration. The emulator starts and attaches.
2. Set breakpoints **in your own `.clx` file.** No copy is generated; the line
   numbers you see are the line numbers you get.
3. While stopped you get the call stack, a Globals scope (tables expand), watch
   expressions, and hover values.
4. Type emulator commands in the **Debug Console**. `help` lists all of them.

**Reading local variables**: use `p <name>` in the Debug Console. This emulator
build cannot enumerate locals, so the **Locals** scope is empty and tells you
so — that is a limitation of the emulator, not something you configured wrong.

**Positions can be off with `#include`**: included files are spliced in at
compile time, so debugger line numbers refer to the compiled result. The
extension calibrates against what the emulator actually loaded; if it cannot
establish the mapping reliably, it refuses to start the debug session rather
than show you wrong line numbers.

### Test automation

While a debug session is running, the **CLX Test** commands inject button
presses, keyboard keys and touch positions, and take screenshots whose pixel
md5 you can compare. They are for regression-testing cartridges.

The same commands are available in the Debug Console behind a `!` prefix, which
makes it easy to step through input frame by frame:

```
!btn LEFT 1          one frame of LEFT
!btn LEFT A 30       LEFT + A for 30 frames
!btn LEFT 500ms      LEFT for 500 ms
!btn 0               release
!shot                screenshot; prints the pixel md5
```

Screenshots go to the extension's own storage, never next to your source files.
The reported md5 covers pixel data only, so it is stable across platforms and
usable as a golden-image key.

Full command reference: [docs/test-automation.md](https://github.com/nan20110923/clx-language/blob/main/docs/test-automation.md).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No completion or hover | Language server download failed — see the **CLX Language Server** output channel |
| Emulator opens but shows its menu | The cartridge did not load: check the first line and the `<name>.clx.rom` file |
| Breakpoints never hit | A previous emulator is still running and holding the debug port. Close it, or run **CLX: Restart Lua Server** |
| "ColoX emulator is already running" | Same cause — one emulator at a time |
| Emulator will not start on Windows 11 | Try reinstalling the .NET Framework (3.5 and 4.8) |

**Setting that helps while debugging**: VS Code moves the cursor to the
breakpoint when execution stops, which interrupts console work. Set
`"debug.focusEditorOnBreak": false` to stop that.

## More

- [ColoX documentation](https://x.cololight.com/mweb/docs/)
- [ColoX VS Code plugin guide](https://x.cololight.com/mweb/docs/VSCodePlugin)
- [Changelog](CHANGELOG.md)

## Credits

The language server is [LuaLS](https://github.com/LuaLS/lua-language-server)
(MIT), used unmodified. CLX's file format is supported through a plugin that
turns the non-Lua sections into comments, so the `.clx` handling can be
maintained independently of the server.

The previous language server was a modified
[EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer);
it required a Java runtime and has been replaced. See
[ADR 0003](https://github.com/nan20110923/clx-language/blob/main/docs/adr/0003-luals-replaces-emmylua.md) for why.
