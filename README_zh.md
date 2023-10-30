# Clx-language

[🌐English](https://dev.azure.com/Lifesmart/_git/clx-language?path=/README.md)

## 简介

您可以使用本插件开发基于LUA扩展语法的CLX程序，该程序可在Lifesmart发布的ColoPlay设备上运行，本插件提供了开发调试相关环境，您可以使用本插件实现：

- CLX语法高亮、语法提示
- ColoX相关接口提示
- 编译文件并在ColoX模拟器中运行
- 断点调试

## 运行环境

本插件目前仅支持Win32和OSX环境，并且需要预先配置好JAVA_HOME环境，目前支持Java11及以上版本，如果您不希望修改系统环境中原有的的JAVA_HOME变量，也可以修改本插件的相关配置项

## 配置项

* Select debugger，本插件内置了ColoPlay和Nature两种模拟器程序
  * Default，本插件会根据文件首行标识的设备规格选择（推荐）
  * Nature，会无条件使用Nature模拟器程序（win32暂不支持)
  * Custom，根据配置项Custom debugger path使用用户指定的程序（一般用户无需使用）
* Custom debugger path，用户指定模拟器程序路径
* JAVA_HOME，上述运行环境中提到的自定义配置项


## 使用

### 新建文件

**新建clx后缀的文件，可以输入template，插件会提示内置的应用初始模板**

![create](https://dev.azure.com/Lifesmart/0f382694-926a-46b1-8cf5-adb164bff633/_apis/git/repositories/c1fc6427-90bd-4448-aa72-d13d91510ed7/items?path=/image/README/debug.png&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0)

### 在模拟器中运行文件

**当鼠标焦点处于clx文件时，点击右上角运行按钮(也可使用F5快捷键)运行文件，即可打开模拟器并运行该文件，同时会在同级目录下生成rom文件**

![run](https://dev.azure.com/Lifesmart/clx-language/_git/clx-language?path=/image/README/run.png)

### 调试

**模拟器内置了调试器，本插件提供简单的断点及命令行调试功能**

1. 左边栏切换到 **Debug**
2. 点击 **Run and Debug**，会启动模拟器并打开一个名为 **debug_temp.clx** 的新文件，该文件包含lua区域包含的所有代码
3. 基于 **debug_temp.clx** 文件进行断点调试
4. 也可以在 **DEBUG CONSOLE** 中进行命令行调试 输入 **help** 可查看使用帮助

![debug](https://dev.azure.com/Lifesmart/clx-language/_git/clx-language?path=/image/README/debug.png)

## 更多

* [ColoX文档](https://x.cololight.com/mweb/docs/)
* 使用技巧

  * 在调试断点时，vscode可能会自动将光标移到断点处，不利于连续的debug console操作，这时可以在设置中将*"debug.focusEditorOnBreak"*项修改为false

## 感谢

本插件的Language Server基于[EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer/)修改
