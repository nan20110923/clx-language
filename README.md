# Clx-language

[🌐中文](https://dev.azure.com/Lifesmart/_git/clx-language?path=/README_zh.md)

## Introduction

You can use this extension to develop CLX programs based on LUA extended syntax, which can be run on ColoPlay devices released by Lifesmart. This extension provides an environment related to development and debugging:

- CLX syntax highlighting, syntax hints
- ColoX related interface tips
- Compile files and run them in ColoX emulator
- Breakpoints debugging

## Environment

This extension currently only supports Win32 and OSX environments, and you need to pre-configure the **JAVA_HOME** environment, currently supports Java11 and above, if you do not want to modify the system environment in the original **JAVA_HOME** variable, you can also modify the extension related configuration items

## Configuration items

* **Select debugger**，this plugin has two built-in emulator programs, ColoPlay and Nature.
  * **Default**, this plugin will select the device specification according to the first line of the file (recommended)
  * **Nature**, will unconditionally use the Nature emulator program (win32 is not supported for the time being)
  * **Custom**, according to the configuration item Custom debugger path to use the user-specified program (general users do not need to use)
* **Custom debugger path**, user-specified emulator program path
* **JAVA_HOME**, the custom configuration item mentioned in the above runtime environment.

## Usage

### Create

To create a new file with a clx suffix, you can type "template" and the plugin will prompt for the built-in initial template for the application

![create](https://dev.azure.com/Lifesmart/0f382694-926a-46b1-8cf5-adb164bff633/_apis/git/repositories/c1fc6427-90bd-4448-aa72-d13d91510ed7/items?path=/image/README/create.png&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0)

### Run the file in the emulator

**When the mouse focus is on the clx file, click the Run button in the upper right corner (you can also use the F5 shortcut key) to run the file, you can open the emulator and run the file, and at the same time, it will generate a rom file in the same directory.**

![run](https://dev.azure.com/Lifesmart/0f382694-926a-46b1-8cf5-adb164bff633/_apis/git/repositories/c1fc6427-90bd-4448-aa72-d13d91510ed7/items?path=/image/README/run.png&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0)

### Debugging

**The simulator has a built-in debugger, and this plugin provides simple breakpoint and command line debugging functions**

1. Switch to **Debug** in the left column.
2. Clicking on **Run and Debug** will start the simulator and open a new file called **debug_temp.clx**, which contains all the code contained in the lua area.
3. Debugging with breakpoints based on **debug_temp.clx** file
4. You can also do command line debugging in **DEBUG CONSOLE**, type **help** to see the help.

![debug](https://dev.azure.com/Lifesmart/0f382694-926a-46b1-8cf5-adb164bff633/_apis/git/repositories/c1fc6427-90bd-4448-aa72-d13d91510ed7/items?path=/image/README/debug.png&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0)

## More

* [ColoX Doc](https://x.cololight.com/mweb/docs/)
* Tips

  * When debugging breakpoints, vscode may automatically move the cursor to the breakpoint, which is not conducive to continuous debug console operation, then you can change the *"debug.focusEditorOnBreak"* item to false in the settings.

## Thanks

The Language Server of this extension is modified based on [EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer/)
