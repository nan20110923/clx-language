# Clx-language

[🌐English](https://github.com/nan20110923/clx-language/blob/main/README.md)

## 简介

在 VS Code 里开发 CLX 程序 —— 一种带扩展语法的 Lua，运行在 Lifesmart 的
ColoPlay 设备上。

- CLX 语法高亮与补全
- ColoX 内置 API 的行内文档
- 在 ColoX 模拟器里运行卡带
- 断点调试，全套操作都在 VS Code 里

## 安装

从 VS Code 市场装上 **clx-language**，然后打开任意 `.clx` 文件即可。没有工具链、
没有环境变量、不需要配置任何东西。

有两样东西会在首次需要时自动下载到 VS Code 的扩展存储里，所有工作区共用：

| 内容 | 何时下载 | 体积 |
|---|---|---|
| 语言服务器（LuaLS） | 首次打开 `.clx` 文件 | 约 1MB |
| ColoX 模拟器 | 首次运行文件 | 约 5MB |

两者都在后台进行，进度显示在状态栏。**语法高亮立即可用**，从不等下载。
下载失败只会少掉对应功能，原因记在 **CLX Language Server** 输出面板里，
编辑和高亮不受影响。

## CLX 的运行时

CLX 是定制版 **Lua 5.4**，32 位数值。有几处与标准 Lua 不同，按标准 Lua 的
预期写会踩坑：

- **`os` 和 `io` 不存在。** 时间用 `stat(90..96)`，文件用 `__resread` / `__reslist`。
- **`print` 是画到屏幕上的**，不输出到控制台。控制台输出用 `printh`。
- **`load` 改名为 `loads`** —— `load` 这个名字被 CLX 自己的「加载卡带」API 占用了。
- **`dofile` 和 `loadfile` 存在但调用即抛错。**

插件的补全已经反映这些差异，不会给你提示 `os` 和 `io`。

## 配置项

| 设置 | 值 | 含义 |
|---|---|---|
| `clx-language.debugger` | `Default` | 使用插件按需下载的模拟器（推荐） |
| | `Custom` | 使用 `debuggerCustomPath` 指定的程序，不下载 |
| `clx-language.debuggerCustomPath` | 路径 | 仅在 `debugger` 为 `Custom` 时生效 |

`Nature` 仍被接受以兼容旧配置，但等同于 `Default` —— 官方已不再单独发布
Nature 模拟器。

### 无法联网时

如果网络访问不了 GitHub Releases，可以自行获取模拟器并指给插件：

1. 把 `clx-language.debugger` 设为 `Custom`。
2. 从 [ColoX 文档页](https://x.cololight.com/mweb/docs/examples) 下载模拟器。
3. 把 `clx-language.debuggerCustomPath` 设为可执行文件：
   - **macOS**：`coloXtool.app/Contents/MacOS/coloXtool` —— 整个 `.app` 目录要一并保留
   - **Windows**：`coloXtool.exe` —— 同级的 dll 要一并保留

**macOS 提示"无法打开，因为无法验证开发者"** 时，文件带了隔离属性，执行一次：

```bash
xattr -d com.apple.quarantine /path/to/coloXtool.app
```

插件自己下载的模拟器不会有这个问题。

语言服务器仍然需要联网，但它是可选的：没有它你照样有语法高亮，本页其余功能
也不受影响。

## 使用

### 新建卡带

新建一个 `.clx` 后缀的文件，输入 `template`。代码片段会展开成一份完整的卡带骨架
—— 设备规格行、Lua 段、以及各个资源段。

**第一行必须写明设备规格**，例如 `coloX-4P`、`coloX-16` 或 `coloX-PICO8`。
模拟器读这一行来决定屏幕尺寸与能力；插件不维护规格列表，所以模拟器支持了新
规格你就能直接用。

### 运行

光标在 `.clx` 文件里时，点编辑器右上角的 **Run** 按钮，或按 <kbd>F5</kbd>。
模拟器会打开并加载这份卡带。

同时你会看到源码旁边多出一个 `<文件名>.clx.rom`。那是模拟器的编译产物 ——
**它才是"卡带确实加载了"的可靠标志。** 如果模拟器窗口开了但这个文件没有，
说明加载失败（通常是抬头写错），模拟器静默退回了它的菜单。

### 调试

1. 左侧切到 **Run and Debug**，启动 `CLX Debugger` 配置。模拟器启动并连上。
2. 断点直接打在**你自己的 `.clx` 文件**上。不生成副本，你看到的行号就是实际行号。
3. 停下时有调用栈、Globals 作用域（表可以展开）、监视表达式和悬停取值。
4. 可以在 **Debug Console** 里敲模拟器命令，输入 `help` 查看全部。

**读局部变量**：在调试控制台里用 `p <名字>`。当前模拟器构建无法枚举局部变量，
所以 **Locals** 作用域是空的并会说明这一点 —— 这是模拟器的限制，不是你配错了。

**带 `#include` 时位置可能有偏差**：被包含文件在编译期被拼接进来，所以调试器的
行号指向编译后的结果。插件以模拟器实际加载的内容为准做校准；如果映射建立不起来，
它会**拒绝启动调试**，而不是给你看错误的行号。

### 测试自动化

调试会话进行中，**CLX Test** 系列命令可以注入按键、键盘键和触摸位置，并截图
（返回像素 md5 便于比对）。它们是给卡带做回归测试用的。

同一批命令也能在调试控制台里用 `!` 前缀调用，适合一帧一帧地试输入：

```
!btn LEFT 1          注入一帧 LEFT
!btn LEFT A 30       LEFT + A 按 30 帧
!btn LEFT 500ms      LEFT 按 500 毫秒
!btn 0               松开
!shot                截图并打印像素 md5
```

截图写在扩展自己的存储目录里，**不会**落到你的源码旁边。返回的 md5 只覆盖像素
数据，所以跨平台一致，可以当金图比对的键。

完整命令表：[docs/test-automation.md](https://github.com/nan20110923/clx-language/blob/main/docs/test-automation.md)。

## 遇到问题时

| 现象 | 可能原因 |
|---|---|
| 没有补全和悬停 | 语言服务器下载失败 —— 看 **CLX Language Server** 输出面板 |
| 模拟器打开了但显示菜单 | 卡带没加载：检查第一行，以及 `<文件名>.clx.rom` 有没有生成 |
| 断点从不命中 | 上一个模拟器还在跑，占着调试端口。关掉它，或执行 **CLX: Restart Lua Server** |
| 提示 "ColoX emulator is already running" | 同样原因 —— 同一时间只能有一个模拟器 |
| Windows 11 上模拟器起不来 | 尝试重新安装 .NET Framework（3.5 和 4.8） |

**调试时有一个设置很有用**：执行停在断点时 VS Code 会把光标移到断点处，打断你在
控制台的操作。把 `"debug.focusEditorOnBreak"` 设为 `false` 可以避免。

## 更多

- [ColoX 文档](https://x.cololight.com/mweb/docs/)
- [ColoX 的 VS Code 插件文档](https://x.cololight.com/mweb/docs/VSCodePlugin)
- [更新记录](CHANGELOG.md)

## 致谢

语言服务器使用 [LuaLS](https://github.com/LuaLS/lua-language-server)（MIT），
未做修改。CLX 的文件格式由一个插件处理 —— 把非 Lua 段替换成注释，所以 `.clx` 的
支持可以独立于服务器维护。

早先的语言服务器是基于
[EmmyLua-LanguageServer](https://github.com/EmmyLua/EmmyLua-LanguageServer)
修改的版本，需要 Java 运行时，已被替换。原因见
[ADR 0003](https://github.com/nan20110923/clx-language/blob/main/docs/adr/0003-luals-replaces-emmylua.md)。
