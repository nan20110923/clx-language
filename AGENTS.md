# AGENTS.md

给在本仓库工作的编码代理和新开发者的操作说明。目标只有一条：改动之后，扩展仍然能在本地跑起来、能正确打包、能通过 CI 发布。

## 项目概况

clx-language 是一个 VS Code 扩展，为 CLX（Lua 扩展语法）提供语法高亮、补全、代码片段，以及用内置的 ColoX 模拟器运行和断点调试。发布者是 LifeSmart，扩展 ID 是 `LifeSmart.clx-language`，仓库在 <https://github.com/nan20110923/clx-language>。

扩展运行在 Windows 和 macOS 上，模拟器没有 Linux 版本。打包和发布在 Linux 的 CI 上进行，那里不会运行模拟器。

## 命令

Node.js 22 或更高，包管理器只使用 yarn 1。

| 用途 | 命令 |
|---|---|
| 安装依赖 | `yarn install`，CI 里加 `--frozen-lockfile` |
| 构建 | `yarn build`，监听改动用 `yarn watch` |
| 类型检查 | `yarn typecheck`（`tsc --noEmit`） |
| Lint | `yarn lint`（`eslint src`） |
| 测试 | `yarn test`（`node:test`） |
| 敏感信息检查 | `yarn check-public`，连历史一起查用 `yarn check-public:history` |
| 端到端 | `yarn e2e`（需图形界面 + 模拟器，不进 CI） |
| 打包 | `yarn package`，在 `.artifacts/` 生成 `clx-language-<version>.vsix` |
| 本地运行 | 在 VS Code 里按 `F5`，启动配置是 `Extension` |

不要使用的命令：

- `npm install`、`npm ci`：仓库只用 yarn。npm 会重新生成 `package-lock.json`，并把 `yarn.lock` 改写成 npm 的格式。`npm run <script>` 没有问题。
- 直接用 `tsc` 编译到磁盘：类型检查走 `--noEmit`，构建走 esbuild。
- 把 `typescript` 升到 7.x：见下面「TypeScript 为什么停在 5.9.3」。

## 目录

```text
src/extension.ts              扩展入口，只做装配（约 90 行）；esbuild 打包成 dist/extension.js
src/ids.ts                    两个 id（LANGUAGE_ID / DEBUG_TYPE）与设置命名空间的唯一住所
src/runClxFile.ts             选模拟器（自定义路径 or 下载）并启动；运行和调试共用
src/language/                 语言侧
  languageServer.ts           CLX 语言服务器（LuaLS）的启停；接管它宣告的 workspace 命令
  lifecycle.ts                命令接管（重名跳过）与生命周期串行队列（纯逻辑）
  lualsServer.ts              LuaLS 包的 VS Code 适配：清单、缓存根、状态栏进度
  lualsBundle.ts              LuaLS 包的纯逻辑：清单校验（带 arch）、就绪判定
  lualsConfig.ts             生成 LuaLS 的 configpath 内容（纯逻辑）
  includePath.ts              #include/#blob/#png 路径补全的纯逻辑
  includeCompletion.ts        上面那个的 VS Code adapter
  languageConfiguration.ts    括号、注释、缩进规则（与根目录的 language-configuration.json 互补）
src/emulator/                 模拟器侧
  emulator.ts                 模拟器包的 VS Code 适配层：清单文件、缓存根、确认弹窗、进度条、输出通道
  emulatorBundle.ts           模拟器包的纯逻辑：清单校验、下载、sha256、解压、原子替换（不 import vscode）
  emulatorProcess.ts          模拟器进程生命周期：spawn、调试通道就绪判定、终止；调试端口只在这里定义
src/debug/                    调试侧
  debugSession.ts             调试适配器（DAP）：只做协议翻译，不含模拟器行协议细节
  debugChannel.ts             调试通道：framing 状态机、请求串行化、异步 `@` 停止帧（不 import vscode）
  luaProtocol.ts              应答体的纯解析函数（bt / i local / i b / src / @ 帧 / shot / vmlist）
  lineMapping.ts              .clx 行号 ↔ `__lua__` 行号的校准（不 import vscode）
  luaValue.ts                 DAP 的裸文本值 → Lua 字面量（`set` 用，不 import vscode）
  testAutomation.ts           注入/截图类命令的应答解析与命令构造（不 import vscode）
  testAutomationCommands.ts   命令面板 adapter（另一个 adapter 是控制台的 `!` 前缀）
  configurationProvider.ts    解析 launch 配置
  activate.ts                 注册调试适配器工厂和 inline values
test/                         node:test 用例，覆盖上面三个不 import vscode 的 module
syntaxes/.tmLanguage.json     TextMate 语法
snippets/snippets.json        代码片段
res/clx-std/{en,zh}           CLX 内置 API 存根，按语言分开
res/clx-lua/{en,zh}           CLX 的 Lua 方言差异（loads、printh、tostr …）
res/luals/clx.lua             LuaLS 插件：把 .clx 的非 Lua 段屏蔽成注释
res/luals-manifest.json       LuaLS 包的清单，指向 GitHub Releases
res/emulator-manifest.json    模拟器包清单，指向 GitHub Releases 的 asset
scripts/pack-emulator.mjs     把模拟器目录打成 tar.gz 并生成清单条目
scripts/pack-luals.mjs        裁剪并打包 LuaLS，生成清单条目
scripts/pack-common.mjs       两个打包脚本共用的 tar/sha256 逻辑
docs/                         开发、部署和决策记录，不进插件包
dist/                         esbuild 打包产物（extension.js），不入库；会被装进插件包
.artifacts/                   交出仓库的东西：模拟器 tar.gz 和 vsix，不入库也不进插件包
```

## 运行时要点

- **构建**：`vsce package` 和 `vsce publish` 会自动执行 `vscode:prepublish` 脚本，把 `src/extension.ts` 压缩打包到 `dist/extension.js`。
- **依赖分两层，别放错**：运行时用到的三个包（`@vscode/debugadapter`、`@vscode/debugprotocol`、`vscode-languageclient`）放在 `dependencies`，其余全在 `devDependencies`。esbuild 会把它们全部内联进 `dist/extension.js`，所以打包时必须带 `--no-dependencies` —— 否则 vsce 会把整个 `node_modules` 再塞一遍（56 文件变 409、8.28MB 变 8.82MB）。`package` 脚本和两个 `vsce publish` 命令都已带这个标记。
- **`@vscode/debugprotocol` 只提供类型**：`import { DebugProtocol }` 被 tsc 完全擦除，esbuild 不会把它打进 bundle。这是正常的，不要因为 bundle 里找不到它就以为少了依赖。
- **两个 id 别搞混**：`clx` 是 language id（`contributes.languages[].id`），`clx_debug` 是 debugger type（`contributes.debuggers[].type`）。语言类 provider（inline values、语言配置）用前者，调试类（配置提供者、适配器工厂）用后者。inline values 曾错注册到 `clx_debug`，因此从未触发。
- **设置命名空间统一在 `clx-language`**：现在只剩 `clx-language.debugger` 和 `clx-language.debuggerCustomPath` 两项，都在 `package.json` 声明。历史上有 `clx.colors.*` 和 `emmylua.source.roots` 这两个未声明的命名空间，用户既发现不了也改不动；那批注解颜色设置已随 annotator 一起删除，自定义配色改用 VS Code 标准的 `editor.semanticTokenColorCustomizations`。
- **`activationEvents` 按需声明**：`onLanguage:clx` 覆盖语法、补全、注解和 Run；`onDebugResolve:clx_debug` 覆盖调试。不要再写 `onDebug` —— 那会让任意工作区的调试都拉起本扩展的语言服务器。
- **语言服务器**：LuaLS（`lua-language-server`，Rust/C++，**不需要 Java**），按需下载到 `globalStorageUri/luals/`。**已经不再有任何 Java 依赖，也不要把它加回来。** 清单 `res/luals-manifest.json` 指向 GitHub Releases，**已发布的 asset 永久不删**。**改 `res/luals/clx.lua`、升级 LuaLS、或排查语言功能问题前，先读 `docs/luals.md`** —— 打包流程、补丁原理、升级时容易坏的地方都在那里。决策背景见 `docs/adr/0003-luals-replaces-emmylua.md`。
- **清单必须带 arch**：LuaLS 按 `darwin-arm64` / `darwin-x64` / `win32-x64` 分发，一个平台不止一份包。ADR 0001 的"归档名不带 arch"规则只适用于模拟器（它只有 x86_64），不要套到这里。
- **`.clx` 的格式差异由插件处理**：`res/luals/clx.lua` 用 LuaLS 的 `OnSetText` 把 `__lua__` 段之外的内容替换成**等宽注释**（行数与列号都不变），所以不需要改 LuaLS 源码。它返回 **diff 表**而不是整串 —— 这样 LuaLS 会维护位置映射，行号正确性由机制保证。改这个插件后必须验证诊断归零，因为等宽性是它的全部前提。
- **路径补全在 VS Code 侧**：`src/language/includeCompletion.ts` 注册 CompletionItemProvider，不进 LuaLS。LuaLS 的插件机制只有 `OnSetText` / `OnTransformAst` / `ResolveRequire`，**没有补全钩子**；硬要做就得改它的源码。VS Code 会合并多个 provider 的结果，不冲突。
- **配置用 `--configpath` 注入**，生成在 `globalStorageUri/luals/config.lua`。不要改成往工作区写 `.luarc.json`：那会污染用户仓库，而且用户的 Lua 配置不该影响 CLX。代价见 ADR 0003。
- **存根要按 CLX 的真实方言写**：CLX 是定制版 **Lua 5.4**（32 位数值），`os` 和 `io` 完全不存在（时间用 `stat(90..96)`，文件用 `__resread`/`__reslist`），`load` 改名 `loads`，`dofile`/`loadfile` 调用即抛错。历史那套 2018 年的 Lua 5.1 存根已经删了，不要从 git 历史里找回来。
- **LuaLS 的 `meta/Lua 5.4 en-us utf8/` 是运行时生成的缓存，不是发行包内容**。打包时只保留 `meta/template/`（源码模板），LuaLS 会按 `Lua.runtime.version` 自己生成标准库定义。`locale/` 必须保留，缺了启动即错。
- **模拟器不再随包分发**：1.1.0 起模拟器按需下载到 `context.globalStorageUri`，由 `src/emulator/emulator.ts`（VS Code 适配）和 `src/emulator/emulatorBundle.ts`（纯逻辑）共同管理。清单 `res/emulator-manifest.json` 指向 GitHub Releases 的 asset。**已发布的 asset 永久不删**，否则旧版扩展在冷缓存时会失能。详见 `docs/adr/0001-emulator-bundles-outside-vsix.md`。
- **归档源自官方发布**：模拟器二进制来自 <https://x.cololight.com/mweb/docs/examples> 的 zip，用 `scripts/pack-emulator.mjs` 重新打成 tar.gz。**不要用仓库里历史上那批 2023/2024 的 `debugger/` 二进制**：官方已不再单独发布 Nature，`coloX-32` 等规格改由同一个二进制处理，macOS 也改成了 `.app` bundle 布局，字体则编译进了可执行文件。
- **模拟器的启动方式**：用 `child_process.spawn` 传参数数组，`coloXtool -d <目录>/ -r <文件>`，调试时加 `-x`。不要改回拼接 shell 字符串的写法：Windows 的 cmd.exe 不认单引号，路径里的引号会被当成路径的一部分。
- **模拟器的选择**：只有两条路。设置了 `clx-language.debugger` = `Custom` 且填了 `debuggerCustomPath` 时完全接管，不下载也不回落；否则用下载的官方包。`Nature` 选项已废弃（等价于 Default）。
- **设备规格不枚举**：首行只要匹配 `coloX-<字母数字>` 或 `X-<宽>x<高>` 就交给模拟器自己判断。不要重新引入 `(4|16|32)` 这类白名单，官方会加新规格（`coloX-PICO8` 就是这么出现的）。
- **调试适配器是内联的**：`src/debug/activate.ts` 注册的工厂返回 `DebugAdapterInlineImplementation`，调试会话运行在扩展进程里。`package.json` 里 `debuggers[0].program` 指向一个不存在的路径，这是遗留配置，不需要补这个文件。
- **动调试代码前先读 `docs/development.md` 的「调试」一节和 `docs/adr/0002-breakpoints-on-the-original-file.md`。** 协议机制都在那里，这里只列不能违反的约束：
  - 断点打在用户的**原始 `.clx` 文件**上。不要重新生成源码副本 —— 那会同时引入两份行号语义。
  - 行号映射建不起来时**拒绝启动调试**，不要猜、不要回退。
  - **不要开第二条到 3563 的连接。** 测试自动化、命令面板、任何新功能都通过活动调试会话的 `clx.testAutomation` 请求。单客户端意味着第二条连接会踢掉扩展自己的。
  - 协议的命令字和应答体形状只写在 `debugChannel.ts` / `luaProtocol.ts`。**不要在调试适配器里拼命令**。
  - 端口号和探测逻辑只在 `src/emulator/emulatorProcess.ts`。
  - 截图路径由适配器定向到 `globalStorageUri/screenshots/`。模拟器的工作目录是用户源码目录，用默认路径会把 BMP 丢在源码旁边。
- **`src/debug/` 不许反向 import `extension.ts`**：调试会话需要启动模拟器时，通过 `activateDebug(context, startEmulator)` 注入的回调用；需要的进程状态从 `src/emulator/emulatorProcess.ts` 取。历史上这里是循环依赖，会让调试适配器无法脱离整个扩展测试。
- **终端用户取消要静默**：`runColoXTool` 返回 `'started' | 'cancelled' | 'failed'`，不是布尔值。用户拒绝下载模拟器时是 `'cancelled'`，调用方不要弹任何错误框。

## 约定

- `dist/`、`.artifacts/` 和 `*.vsix` 不入库。`dist/` 放会被装进插件包的构建产物，`.artifacts/` 放交出去的东西（模拟器归档、vsix），两者不要混。不要往 `dist/` 里放 vsix：`vscode:prepublish` 每次先 `rimraf dist`，上一份产物会连根消失。
- 模拟器归档里的可执行位必须保留。`src/emulator/emulatorBundle.ts` 解压时按 tar 头的 mode 还原权限；打包脚本拒绝 symlink 和非普通文件。
- `src/emulator/emulatorBundle.ts`、`src/debug/debugChannel.ts`、`src/debug/luaProtocol.ts`、`src/debug/lineMapping.ts`、`src/language/lifecycle.ts` 都不许 import `vscode`。它承载全部处理不可信输入的代码（tar 解析、路径穿越防护、sha256），必须能在普通 Node 进程里加载和测试。需要编辑器能力时从参数注入 `ProgressSink` / `Cancellation` / `CommandRegistrar`。
- **语言客户端的命令注册不许交回 `vscode-languageclient`。** LuaLS 在 initialize 里静态宣告 `lua.removeSpace` / `lua.solve` / `lua.jsonToLua` 等 workspace 命令，库对每个名字直接 `registerCommand`；命令是全局命名空间，重名会抛错，而异常发生在 `initializeFeatures` 里，**整个语言客户端**跟着起不来（表现为 "couldn't create connection to server"）。`src/language/languageServer.ts` 的 `takeOverCommands()` 接管了这个环节，重名只跳过、不让启动失败。同理 `start` / `stop` / `restart` 必须走 `LifecycleQueue`：两个客户端同时在役也会撞上同一批名字。细节与升级核对方法见 `docs/luals.md` 的「命令重名」。
- 三个平台的模拟器二进制都只有 x86_64（macOS 靠 Rosetta 2）。归档按 **platform** 命名，**不要**带 `process.arch`，否则 Apple Silicon 会去找不存在的 arm64 包。
- macOS 的 `.app` 结构不能压平：可执行文件用 `@executable_path/../Frameworks` 加载 SDL2，清单里的 `executable` 和 `libraryPath` 缺一不可。
- 官方 macOS 包是 ad-hoc 签名、未公证。插件自己下载的文件不带 quarantine 属性所以能直接跑；用户手动下载的会被 Gatekeeper 拦，README 里给了 `xattr -d com.apple.quarantine`。
- 代码风格跟随所在文件现有的缩进和写法，不要顺手格式化整个文件。注释里中英文都有，保持原样即可。
- **这个仓库是 public。** 提交前想一下：本机绝对路径、内网地址/主机名、内部仓库名、
  凭据都不该进去。`yarn check-public` 会拦这几类（pre-commit 查暂存区，CI 连历史一起查）。
  确实无害但被误报时，在该行加 `allow-public` 注释；历史里的误报只能在
  `scripts/check-public.mjs` 的 `HISTORY_ALLOWLIST` 里登记路径，并写明理由。
- 工作区设置把 `main` 设为受保护分支（`.vscode/settings.json`），在 VS Code 里直接提交到 `main` 会提示新建分支。
- **提交前钩子跑 lint/typecheck/test/check-public**：仓库用 `core.hooksPath=.githooks`（不是 husky）。换机器 clone 后要执行一次 `git config core.hooksPath .githooks`，否则钩子不生效。确实需要跳过时用 `git commit --no-verify`。
- **TypeScript 锁在 5.9.3，不要升到 7.x。** TS 7 是原生重写版，`require("typescript")` 只返回 `{ version }`（编译 API 在 `./unstable/*` 下），`@typescript-eslint` 会直接拒绝启动。官方共存方案要把 `typescript` alias 到 `@typescript/typescript6`、TS 7 用别名给 `tsc`，但 **yarn 1 不支持 npm alias**（空白项目上也会失败）。要升就得连包管理器一起换。详细理由见 `docs/development.md`。
- `@typescript-eslint@8` 的 peer 是 `typescript >=4.8.4 <6.1.0`。换 TS 版本前先确认还落在范围里，否则 `yarn lint` 会挂。

## 打包规则

插件包的内容由 `.vscodeignore` 控制。下面这些必须留在排除列表里：

- `AGENTS.md`、`GLOSSARY.md` 和 `docs/**`：只需要给开发者看，不需要分发给用户。
- `.github/**`：vsce 内置的 `.github` 排除项匹配不到目录下的文件，必须显式写。
- `scripts/**`、`.artifacts/**`：构建和文档素材，不进插件包。
- `src/**` 和 `tsconfig.json`：`src/` 已经被 esbuild 打成一个 `dist/extension.js`，运行时没有读者。漏掉这条会发出 13 个 `.ts` 文件。

判断标准很简单：运行时的 `extensionPath` 下只应该有 `dist/`、`res/`、`syntaxes/`、`snippets/`、`language-configuration.json` 和几个 md。**只要源文件出现在包里，就是 `.vscodeignore` 漏了。**

根目录的 `README.md` 就是插件市场的 DETAILS 页面，打包时会被改名成 `extension/readme.md`，所以不要把它加进排除列表。`README_zh.md` 也会随包发布，供插件内跳转使用。

## 验证改动

交付前至少做完下面这些：

1. `yarn typecheck`、`yarn lint`、`yarn test`、`yarn check-public` 四条都过。
2. `yarn package` 成功，产物在 `.artifacts/clx-language-<version>.vsix`。改动涉及打包内容时用 `unzip -l .artifacts/*.vsix` 检查，确认该有的在、不该有的不在（`src/`、`test/`、`out/`、`tsconfig.json`、`eslint.config.mjs` 都不该出现）。CI 的 `Build VSIX` workflow 会跑同样的断言。
3. 改动涉及运行时行为时，按 `F5` 在 Extension Development Host 里实际验证：
   - 打开一个 `.clx` 文件，语法高亮立即可用；等状态栏的下载完成后补全与 hover 正常。
   - 点击编辑器右上角的运行按钮，模拟器启动，并生成 `<文件名>.clx.rom`。
   - 调试流程：断点应打在原始 `.clx` 文件上，停下时报告**原文件的行号**，调用栈、Globals、监视都有内容。

**测试覆盖什么、不覆盖什么**：`test/` 只覆盖不 import `vscode` 的纯逻辑（协议解析、行号映射、值转换、命令构造）。DAP 适配器本身、以及和真实模拟器的交互，只能靠上面的 F5 验证 —— 没有自动化。所以改动 `debugSession.ts` 一定要手工跑一次调试。

验证模拟器时的注意点：

- 判断文件有没有加载成功，看 `<文件名>.clx.rom`，**不要**看 3563 端口 —— 加载失败时模拟器也会继续监听端口。
- 模拟器的 stdout 被管道捕获时是全缓冲的，只有它正常退出后才能读到启动时打印的内容。

## 发布

发布只通过 GitHub Actions 进行（`.github/workflows/publish.yml`），用 Marketplace Trusted Publishing 认证（`vsce publish --oidc`），不使用 PAT。

1. 在 `CHANGELOG.md` 顶部按现有格式添加一条：`### <版本> (YYYY-MM-DD)`。
2. 把 `package.json` 的 `version` 改成同一个版本。
3. 提交并推送，然后打 tag。**通道由 tag 名决定**：
   - `v<版本>` → 正式版
   - `v<版本>-rc.<n>` → 预发布（例如 `v1.3.0-rc.1`）

   两种情况 `<版本>` 都必须与 `package.json` 完全一致，否则 workflow 在发布前报错。
4. 在仓库的 Actions 页确认运行结果。

- 不要手动执行 `vsce publish`，也不要把任何令牌写进仓库或日志。
- **`package.json` 的版本不能带 `-beta` / `-rc` 后缀** —— vsce 会拒绝。预发布是 vsix 里的
  一个 `preRelease` 属性，版本号本身不变。所以 `v1.3.0-rc.1` 与 `v1.3.0` 版本号相同，
  正式版会取代同号的预发布；CHANGELOG 只需一条 `1.3.0`。
- 版本号只支持 `主版本.次版本.修订号`。同一通道内不能重复发布同一个号 ——
  但同一个号可以先发预发布、再发正式版。
- **publish.yml 会跑完整检查**（typecheck / lint / test / check-public --history / 包内容断言）。
  不要为了绕开某项失败而删掉这些步骤 —— 它们和 build.yml 是同一套门。
- 只有推送 `v*` 开头的 tag 或手动触发才会发布，推送到 `main` 不会。手动触发只在应急时用：
  它不留 tag 锚点，事后无法从版本号追溯到提交。
