# Clx-language

## 简介

您可以使用本插件开发基于LUA扩展语法的CLX程序，该程序可在Lifesmart发布的ColoPlay设备上运行，本插件提供了开发调试相关环境，您可以使用本插件实现：

- CLX语法高亮、语法提示
- ColoX相关接口提示
- 编译文件并在ColoX模拟器中运行
- 断点调试

## 运行环境

本插件目前仅支持Win32和OSX环境，并且需要预先配置好JAVA_HOME环境，目前支持Java11及以上版本，如果您不希望修改系统环境中原有的的JAVA_HOME变量，也可以修改本插件的相关配置项

## 更多

#### 文档

[ColoX文档](https://x.cololight.com/mweb/docs/)

#### 使用技巧

在调试断点时，vscode可能会自动将光标移到断点处，不利于连续的debug console操作，这时可以在设置中将下列配置项修改为false

```json
"debug.focusEditorOnBreak": false
```

## 感谢

本插件的Language Server基于[EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer/)修改
