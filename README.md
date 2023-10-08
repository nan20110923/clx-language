# Clx-language

[🌐中文](https://dev.azure.com/Lifesmart/_git/clx-language?path=/README_zh.md)

## Introduction

You can use this extension to develop CLX programs based on LUA extended syntax, which can be run on ColoPlay devices released by Lifesmart. This extension provides an environment related to development and debugging:

- CLX syntax highlighting, syntax hints
- ColoX related interface tips
- Compile files and run them in ColoX emulator
- Breakpoints debugging

## Environment

This extension currently only supports Win32 and OSX environments, and you need to pre-configure the JAVA_HOME environment, currently supports Java11 and above, if you do not want to modify the system environment in the original JAVA_HOME variable, you can also modify the extension related configuration items

## More

* [ColoX Doc](https://x.cololight.com/mweb/docs/)
* Tips

  * When debugging breakpoints, vscode may automatically move the cursor to the breakpoint, which is not conducive to continuous debug console operation, then you can change the *"debug.focusEditorOnBreak"* item to false in the settings.

## Thanks

The Language Server of this extension is modified based on [EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer/)
