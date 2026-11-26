# GLOSSARY

本仓库的领域术语。只放词汇，不放实现细节。

## 模拟器 (emulator)

ColoX 的可执行程序，当前唯一的产品形态是 `coloXtool`（macOS 上是 `coloXtool.app`，Windows 上是 `coloXtool.exe`），由 Lifesmart 官方发布。

一个二进制处理全部设备规格，包括 `coloX-4P`、`coloX-16`、`coloX-PICO8`、`coloX-32` 等。历史上曾有两种形态（ColoPlay 与 Nature）并各自独立发布，现已合并。

不叫 "debugger"。模拟器只是被调试目标，它本身不实现调试协议。

## 调试适配器 (debug adapter)

把 VS Code 的 DAP 请求翻译成模拟器自带调试通道（本机 TCP 3563）协议的那层代码，位于 `src/debugger/`。

不叫 "debugger"，以区别于上面的模拟器。

## 设备规格 (device specification)

CLX 文件首行标注的目标设备型号，例如 `coloX-4P` 或 `coloX-PICO8`。由模拟器解读，插件只负责把首行原样交给它。

## 模拟器包 (emulator bundle)

可分发的一份模拟器，按平台区分：darwin、win32。

包的身份由**构建日期 + 内容 sha256** 确定。仓库内部没有语义化版本。归档由官方 zip 重新打包而成。

## 模拟器清单 (emulator manifest)

列出所有模拟器包的身份和下载位置的元数据文件。扩展据此判断本机是否已有可用包、要不要下载。

## 模拟器缓存 (emulator cache)

本机已下载解压的模拟器包所在位置，由扩展管理，对所有工作区共用。
