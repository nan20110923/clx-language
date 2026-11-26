# Clx-language

[🌐中文](https://github.com/nan20110923/clx-language/blob/main/README_zh.md)

## Introduction

You can use this extension to develop CLX programs based on LUA extended syntax, which can be run on ColoPlay devices released by Lifesmart. This extension provides an environment related to development and debugging:

- CLX syntax highlighting, syntax hints
- ColoX related interface tips
- Compile files and run them in ColoX emulator
- Breakpoints debugging

## Environment

This extension currently only supports Win32 and OSX environments, and you need to pre-configure the **JAVA_HOME** environment, currently supports Java11 and above, if you do not want to modify the system environment in the original **JAVA_HOME** variable, you can also modify the extension related configuration items

## Configuration items

* **Select debugger**
  * **Default**, use the emulator downloaded on demand by the extension (recommended)
  * **Nature**, deprecated. Nature is no longer published separately; this behaves like Default
  * **Custom**, use the program at **Custom debugger path** and never download
* **Custom debugger path**, user-specified emulator program path, only used when **Select debugger** is `Custom`
* **JAVA_HOME**, the custom configuration item mentioned in the above runtime environment.

## Emulator download

Starting with 1.1.0 the emulator is no longer installed together with the extension. It is downloaded once on first run (about 5 MB) and reused from a local cache afterwards.

**The first time you run a file, the extension asks whether to download it and then shows the download progress.** The emulator is stored in VS Code's extension global storage, shared by every workspace, and removed when the extension is uninstalled.

Device specifications (`coloX-4P`, `coloX-16`, `coloX-PICO8`, `coloX-32`, …) are recognised by the emulator itself; the extension no longer keeps a list of them.

### Without internet access

If your network cannot reach GitHub Releases (an intranet, for example), obtain the emulator yourself, set `clx-language.debugger` to `Custom`, and point `clx-language.debuggerCustomPath` at the emulator executable:

* macOS: point at `coloXtool.app/Contents/MacOS/coloXtool`; keep the whole `.app` directory
* Windows: point at `coloXtool.exe`; keep the sibling dlls

The emulator can be obtained from the [ColoX documentation download page](https://x.cololight.com/mweb/docs/examples).

**If macOS refuses to open it ("cannot be opened because the developer cannot be verified")**, the file carries a quarantine attribute. Remove it once in Terminal:

```bash
xattr -d com.apple.quarantine /path/to/coloXtool.app
```

An emulator downloaded by the extension does not have this problem.

## Usage

### Create

To create a new file with a clx suffix, you can type "template" and the plugin will prompt for the built-in initial template for the application

![create](https://x.cololight.com/mweb/docs/assets/images/create-1d320d24952dbca8a347efd2e0725f29.gif)

### Run the file in the emulator

**When the mouse focus is on the clx file, click the Run button in the upper right corner (you can also use the F5 shortcut key) to run the file, you can open the emulator and run the file, and at the same time, it will generate a rom file in the same directory.**

![run](https://x.cololight.com/mweb/docs/assets/images/run-0dad04a59d0723673c04cc5540ce15f6.gif)

### Debugging

**The simulator has a built-in debugger, and this plugin provides simple breakpoint and command line debugging functions**

1. Switch to **Debug** in the left column.
2. Clicking on **Run and Debug** will start the simulator and open a new file called **debug_temp.clx**, which contains all the code contained in the lua area.
3. Debugging with breakpoints based on **debug_temp.clx** file
4. You can also do command line debugging in **DEBUG CONSOLE**, type **help** to see the help.

![debug](https://x.cololight.com/mweb/docs/assets/images/debug-258b9f11b14dfc971b29f6719a4aaba5.gif)

## More

* [VS Code plugin guide](https://x.cololight.com/mweb/docs/VSCodePlugin)
* [ColoX Doc](https://x.cololight.com/mweb/docs/)
* Tips

  * When debugging breakpoints, vscode may automatically move the cursor to the breakpoint, which is not conducive to continuous debug console operation, then you can change the *"debug.focusEditorOnBreak"* item to false in the settings.
  * If the emulator not startup properly on Windows 11, try reinstalling the .NET Framework (3.5 and 4.8)

## Thanks

The Language Server of this extension is modified based on [EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer/)
