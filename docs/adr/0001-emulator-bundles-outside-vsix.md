# 0001 模拟器包不再随插件分发

日期：2026-11-26
状态：已采纳

## 背景

插件曾把模拟器二进制直接放在 `debugger/` 下随 vsix 分发。这些二进制最后一次更新是 2023-10 到 2024-09，未压缩共 52MB：

| 目录 | 大小 | 说明 |
|---|---|---|
| `debugger/nature/` | 32MB | Nature 模拟器，其中 `res/` 的字体占 18MB |
| `debugger/win32/` | 11MB | Windows 版 ColoPlay |
| `debugger/osx/` | 9.4MB | macOS 版 ColoPlay |

每个用户为了跑一个平台的模拟器，都要下载另外两个平台的二进制。打包后的 vsix 是 34.5MB。

同时，这些内置二进制已经**严重过时**。Lifesmart 官方在 <https://x.cololight.com/mweb/docs/examples> 提供的当前版本是 2026-11-19，与仓库里的版本有三处结构性差异：

- 官方已**不再单独发布 Nature**。`coloX-32` 等设备规格由同一个二进制处理，不再是独立程序
- macOS 发布形态是标准 `coloXtool.app` bundle，不再是裸 `MacOS/` + `Frameworks/` 目录
- 字体从外置 `res/` 目录改为**编译进可执行文件**（内置约 9MB 字体表），所以新包不含 `res/`

## 决定

把模拟器从插件包里剥离，改为首次运行时按需下载到扩展的 global storage。

- 两个包：`ColoPlay/darwin`、`ColoPlay/win32`，当前各约 5.2MB / 5.7MB（tar.gz）
- 归档格式选 `.tar.gz` 而不是 `.zip`：Node 内置 `zlib` 就能解，权限位天然保留
- 包的身份是**构建日期 + 内容 sha256**，因为没有语义化的模拟器版本
- 清单（`res/emulator-manifest.json`）编译进插件，不运行时拉取
- 归档由 `scripts/pack-emulator.mjs` 从官方 zip 重新打包，上传到本仓库的 GitHub Releases

## 后果

**必须遵守的约束：模拟器 Release 的 asset 永久不删。** 清单是编译进插件的，1.1.0 的清单指向 `emu-2026-11-19` 这个 tag。删掉 asset 会让所有已安装的 1.1.0 在冷缓存时永久失能。新增模拟器包只能以新 tag 追加。

升级后的行为变化：

- 1.0.18 及更早的用户升级后，本机没有模拟器缓存，首次点 Run 需要联网下载一次
- **离线或内网用户会失能**，逃生口是设置 `clx-language.debuggerCustomPath` 指向自己手里的模拟器副本
- `clx-language.debugger` 的 `Nature` 选项废弃（官方已不单独发布），选了等价于 `Default`
- 设备规格不再由插件枚举。首行只要有 `coloX-<规格>` 或 `X-<宽>x<高>` 就交给模拟器判断，这样官方新增规格（如 `coloX-PICO8`）无需改插件

选择而不是备选方案的理由：

- 不重写 git 历史。仓库里的历史保留，代价是克隆仍慢，但避免了所有 fork 和克隆失效。
- 不做自定义下载镜像。既然已有 `debuggerCustomPath`，需要绕开 GitHub 的用户可以直接指本地路径。
- 不在运行时直接下载官方 zip。那样要多一个 zip 解压依赖，且官方换 URL 或改结构时没有缓冲；我们现在自己重新打包，能在发布前验证。

## 相关的坑

- 三个平台的二进制都只有 x86_64（macOS 在新机器上靠 Rosetta 2）。归档按 **platform** 命名，**不要**带 `process.arch`，否则 Apple Silicon 会去找不存在的 arm64 包。
- macOS 的 `.app` 结构不能压平：可执行文件用 `@executable_path/../Frameworks` 加载 SDL2，所以清单里同时记录 `executable` 和 `libraryPath`，解压后必须是完整的 `Contents/` 布局。
- 官方 macOS 包是 **ad-hoc 签名、未公证**。通过 Node `https` 下载的文件不带 quarantine 扩展属性，可以直接运行；用户手动下载再指定路径的情形会被 Gatekeeper 拦，README 里给了 `xattr -d com.apple.quarantine` 的说明。
- macOS 的可执行位必须保留，解压时按 tar 头里的 mode 还原，不能依赖默认 umask。
