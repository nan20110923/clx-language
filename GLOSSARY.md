# GLOSSARY

本仓库的领域术语。只放词汇，不放实现细节。

## 模拟器 (emulator)

ColoX 的可执行程序，当前唯一的产品形态是 `coloXtool`（macOS 上是 `coloXtool.app`，Windows 上是 `coloXtool.exe`），由 Lifesmart 官方发布。

一个二进制处理全部设备规格，包括 `coloX-4P`、`coloX-16`、`coloX-PICO8`、`coloX-32` 等。历史上曾有两种形态（ColoPlay 与 Nature）并各自独立发布，现已合并。

不叫 "debugger"。模拟器只是被调试目标，它本身不实现调试协议。

## 调试适配器 (debug adapter)

把 VS Code 的 DAP 请求翻译成调试通道协议的那层代码，位于 `src/debug/debugSession.ts`。

不叫 "debugger"，以区别于上面的模拟器。它不含协议细节 —— 那些在调试通道里。

## 调试通道 (debug channel)

模拟器自带的行协议：本机 TCP 3563，一行一条命令，应答用 `>-><token>` / `<-<<token>` 分帧。位于 `src/debug/debugChannel.ts`。

它和调试适配器是两件事：适配器讲 DAP，通道讲模拟器的方言。两者之间的 seam 是这次重构的重点 —— 把协议知识集中到一处，才可能脱离 VS Code 测试。

不叫 "debugger"，也不叫 "debug server"（那个词属于模拟器侧）。

## 停止帧 (stop frame)

调试通道里的异步应答，token 是 `@`，形状是 `>->@ … <-<@`。它不属于任何请求，可能在任何时刻到达，内容是 `func at source:line` 加一行的源码。

调试适配器据此发 DAP 的 StoppedEvent。

## 测试自动化 (test automation)

通过调试通道操控被调试程序的那组命令：`btn` / `padset` / `mouse` / `key` 注入输入，`shot` 截图，`input?` 查询，`vmlist` / `vm` 管多 VM。

和"看变量、走断点"是两件事，所以走 `src/debug/testAutomation.ts`（纯解析），不并进调试通道。

两个 adapter 共享同一个调试会话，不是第二条连接：

- 命令面板的 `CLX Test` 命令，适合一次性动作（截个图）
- 调试控制台里的 `!` 前缀（`!btn LEFT 30`），适合边跑边一帧一帧试

**不能自己连 3563。** 那条通道只允许一个客户端，多开一条会把扩展自己的连接挤掉。

## 行号映射 (line mapping)

`.clx` 源文件行号与模拟器 `__lua__` 缓冲区行号之间的对应关系，位于 `src/debug/lineMapping.ts`。

需要它是因为 `#include` 会把被包含文件的字节直接拼进缓冲区，两者不再等差。校准以 `src __lua__` 返回的实际内容为准，`#include` 的行数解析只做交叉校验。

有它才能把断点打在用户的原始文件上，而不必生成源码副本。

## 设备规格 (device specification)

CLX 文件首行标注的目标设备型号，例如 `coloX-4P` 或 `coloX-PICO8`。由模拟器解读，插件只负责把首行原样交给它。

## 模拟器包 (emulator bundle)

可分发的一份模拟器，按平台区分：darwin、win32。

包的身份由**构建日期 + 内容 sha256** 确定。仓库内部没有语义化版本。归档由官方 zip 重新打包而成。

## 模拟器清单 (emulator manifest)

列出所有模拟器包的身份和下载位置的元数据文件。扩展据此判断本机是否已有可用包、要不要下载。

## 模拟器缓存 (emulator cache)

本机已下载解压的模拟器包所在位置，由扩展管理，对所有工作区共用。
