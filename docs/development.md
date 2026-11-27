# 开发与部署

本文件面向维护 clx-language 的开发者，说明如何搭环境、构建、调试、打包和发布。扩展的用户说明见根目录的 [README.md](../README.md) 和 [README_zh.md](../README_zh.md)，编码代理的操作约定见 [AGENTS.md](../AGENTS.md)。

- 插件市场：<https://marketplace.visualstudio.com/items?itemName=LifeSmart.clx-language>
- 仓库：<https://github.com/nan20110923/clx-language>

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 22 或更高 | 打包和发布用的 `@vscode/vsce` 要求 22 以上，CI 使用 24 |
| yarn | 1.x | 仓库只使用 yarn |
| VS Code | 1.91 或更高 | 与 `package.json` 的 `engines.vscode` 一致 |

扩展本身运行在 Windows 和 macOS 上，模拟器没有 Linux 版本。打包和发布在 Linux 的 CI 上进行，那里只需要构建，不需要运行模拟器。

## 初始化

```bash
git clone https://github.com/nan20110923/clx-language.git
cd clx-language
yarn install
./scripts/setup-hooks.sh   # 启用 pre-commit（跑 typecheck + lint + test + check-public）
```

仓库只使用 yarn。不要运行 `npm install` 或 `npm ci`：npm 会重新生成 `package-lock.json`，并把 `yarn.lock` 改写成 npm 的格式。`npm run <script>` 不受影响。

## 目录结构

```text
src/                            TypeScript 源码，由 esbuild 打包成 dist/extension.js
  extension.ts                  扩展入口，只做装配：注册命令、把各模块的生命周期挂到 subscriptions
  ids.ts                        两个 id（LANGUAGE_ID / DEBUG_TYPE）与设置命名空间的唯一住所
  runClxFile.ts                 选模拟器并启动：自定义路径或按需下载；运行和调试共用这一条
  language/                     语言侧
    languageServer.ts           CLX 语言服务器（LuaLS）启停
    lualsServer.ts              LuaLS 包的 VS Code 适配：清单、缓存根、状态栏进度
    lualsBundle.ts              LuaLS 包的纯逻辑：清单校验（带 arch）、就绪判定
    lualsConfig.ts              生成 LuaLS 的 configpath 内容
    includePath.ts              #include/#blob/#png 路径补全的纯逻辑
    includeCompletion.ts        上面那个的 VS Code adapter
    languageConfiguration.ts    括号、注释、缩进规则
  emulator/                     模拟器侧
    emulator.ts                 模拟器包的 VS Code 适配：清单文件、缓存根、确认弹窗、进度条
    emulatorBundle.ts           模拟器包的纯逻辑：下载、sha256、tar 解压、原子替换（不 import vscode）
    emulatorProcess.ts          模拟器进程生命周期：spawn、调试通道就绪、终止；3563 只在这里定义
  debug/                        调试侧
    debugSession.ts             调试适配器（DAP）：只做协议翻译
    debugChannel.ts             调试通道：framing、请求串行化、异步 @ 停止帧（不 import vscode）
    luaProtocol.ts              应答体解析：bt / i local / i b / src / @ 帧 / shot / vmlist（不 import vscode）
    lineMapping.ts              .clx 行号 ↔ __lua__ 行号校准（不 import vscode）
    luaValue.ts                 DAP 裸文本值 → Lua 字面量（不 import vscode）
    testAutomation.ts           注入/截图命令的应答解析（不 import vscode）
    testAutomationCommands.ts   命令面板 adapter
    configurationProvider.ts    解析 launch 配置
    activate.ts                 注册调试适配器工厂和 inline values
test/                           node:test 用例，覆盖上面三个不 import vscode 的 module
syntaxes/.tmLanguage.json       TextMate 语法
snippets/snippets.json          代码片段
language-configuration.json     语言配置
res/clx-std/{en,zh}             CLX 内置 API 存根
res/clx-lua/{en,zh}             CLX 的 Lua 方言差异
res/luals/clx.lua               LuaLS 插件：屏蔽 .clx 的非 Lua 段
res/luals-manifest.json         LuaLS 包清单
res/emulator-manifest.json      模拟器包清单，指向 GitHub Releases
scripts/pack-emulator.mjs       模拟器打包脚本
scripts/pack-luals.mjs          LuaLS 裁剪打包脚本
scripts/pack-common.mjs         打包脚本共用工具
docs/                           开发、部署文档和决策记录
dist/                           esbuild 打包产物，不入库；会被装进插件包
.artifacts/                     模拟器 tar.gz 和 vsix，不入库也不进插件包
```

## 构建

```bash
yarn build    # 打包到 dist/extension.js，带 sourcemap
yarn watch    # 监听文件改动，自动重新打包
```

`package.json` 的 `main` 指向 `dist/extension.js`，所以 `dist/` 缺失时扩展无法激活，所有命令都会提示找不到。执行过一次 `yarn build` 即可。

### 运行时要点

- **语言服务器**：LuaLS，按需下载到 `globalStorageUri/luals/`，不需要 Java。清单 `res/luals-manifest.json` 指向 GitHub Releases，**已发布的 asset 永久不删**。`.clx` 的格式差异由 `res/luals/clx.lua` 插件处理（把非 Lua 段替换成等宽注释），LuaLS 源码未改动。

  **打包、补丁原理、升级流程、排查手册都在 [`docs/luals.md`](luals.md)。** 那一份是权威，不要在这里重复维护。要点速记：`meta/template/` 必须保留（标准库定义的源码模板），`meta/` 下的其他目录是 Unity/.NET 绑定和第三方框架，删；三个平台都要打；清单里的 `arch` 必填。

- **模拟器的启动方式**：用 `child_process.spawn` 传参数数组，`coloXtool -d <目录>/ -r <文件>`，调试时加 `-x`。不要改回拼接 shell 字符串的写法：Windows 的 cmd.exe 不认单引号，路径里的引号会被当成路径的一部分，表现是 `EIE:open file err`。
- **模拟器不再随包分发**：1.1.0 起按需下载到 `context.globalStorageUri/emulators/ColoPlay-<platform>-<date>-<sha前8位>/`，由 `src/emulator/emulator.ts`（VS Code 适配）和 `src/emulator/emulatorBundle.ts`（纯逻辑）共同管理。首次下载前弹一次确认，之后静默复用缓存。缓存目录里写 `.complete` 标记，缺失或可执行文件不在就整个重下。

  归档来源是官方发布页 <https://x.cololight.com/mweb/docs/examples>。发布新模拟器包的流程：

  ```bash
  # 1. 从官方页下载 zip，解压到临时目录（macOS 要保留整个 coloXtool.app）
  #    页面的 Last-Modified 就是这里的 --date

  # 2. 打包（自动算 sha256 和体积）
  node scripts/pack-emulator.mjs --product ColoPlay --platform darwin \
    --dir /tmp/mac/coloXtool.app --exe Contents/MacOS/coloXtool \
    --library Contents/Frameworks --date 2026-11-19

  node scripts/pack-emulator.mjs --product ColoPlay --platform win32 \
    --dir /tmp/win/coloXtool_win32 --exe coloXtool.exe --date 2026-11-19

  # 3. 上传到新的 Release（tag 用清单里的 release 字段）
  gh release create emu-2026-11-19 .artifacts/*.tar.gz

  # 4. 把 .artifacts/*.json 的内容合并进 res/emulator-manifest.json，
  #    同时改 release 字段，然后提升 package.json 版本并发布扩展
  ```

  **已发布的 asset 永久不删。** 清单编译在插件里，旧版扩展会一直指向它发布时的那个 tag。

  **不要用仓库历史里的 `debugger/` 二进制**。那批是 2023/2024 的，官方此后改了三件事：不再单独发布 Nature、macOS 改成 `.app` bundle、字体编译进可执行文件。用旧包会得到与官方不一致的行为。
- **模拟器的选择**：只有两条路。`clx-language.debugger` 为 `Custom` 且填了 `debuggerCustomPath` 时完全接管，不下载也不回落；否则用下载的官方包。`Nature` 选项已废弃，等价于 `Default`。
- **设备规格不枚举**：首行只要匹配 `coloX-<字母数字>` 或 `X-<宽>x<高>` 就交给模拟器判断。不要重新引入 `(4|16|32)` 白名单，官方会加新规格。
- **调试适配器是内联的**：`src/debug/activate.ts` 注册的工厂返回 `DebugAdapterInlineImplementation`，调试会话运行在扩展进程里。`package.json` 里 `debuggers[0]` 不需要 `program` 字段。
- **调试通道**：本机 TCP 3563，只允许一个客户端连接。`-x` 启动的模拟器会停在 `XLUADBG wait`，必须收到 `c` 才执行，所以 `configurationDoneRequest` 里要真的发 `c`；同理声明了 `supportsTerminateRequest` 就必须覆写 `terminateRequest`。协议层全部在 `src/debug/debugChannel.ts` 与 `src/debug/luaProtocol.ts`。
- **断点打在原始 `.clx` 文件上**，不生成 `debug_temp.clx` 副本：模拟器只认内部名为 `__lua__` 的缓冲区。行号换算见 `src/debug/lineMapping.ts`，映射建立不起来时拒绝启动调试。详见 `docs/adr/0002-breakpoints-on-the-original-file.md`。
- **`i local` 拿不到局部变量**（模拟器侧的帧偏移 bug）。内嵌的 Lua helper 硬编码了 `debug.getlocal(frame + 2, …)` 的 `+2`，帧偏移错，报的是卡带顶层 chunk。同一帧上 `p <名字>` 是正确的，所以 Variables 面板的 Locals 会明确提示改用 `p`。不要试图靠解析 `i local` 的文本凑出局部变量。
- **`src __lua__` 应答里的 `__lua__:N`，N 是行数不是起始行号**，且**比正文行数少 1**（文件末尾空行不计）。别拿它做行号校验，正文是权威。历史上它被误读成"`__lua__` 段在原文件里的起始行"，导致断点整体错位。
- **协议权威来源**：模拟器官方源码的 `c/coloX/src/coloX_dbg.cpp` 是权威实现（文档是摘要，漏掉应答体形状和错误文本）；`c/coloX/guide/debug.md` 是官方文档；`dbgtool/` 是手工客户端参考。改协议层前先对照它们，`help` 命令也能从模拟器直接问出全量命令表。
- **运行成功与否的判断**：看文件同级目录是否出现 `.rom`，不要看 3563 端口有没有打开。加载失败时模拟器也会继续运行并监听端口。
- **macOS Gatekeeper**：官方 macOS 包是 ad-hoc 签名、未公证。插件通过 `https` 下载的文件不带 quarantine 属性，能直接跑；手工下载再指定路径的情形会被拦，需要 `xattr -d com.apple.quarantine`。

## 本地调试扩展

在 VS Code 里按 `F5`，启动配置是 `Extension`，会打开 Extension Development Host。

`outFiles` 指向 `dist/`（esbuild 的实际产物）。如果 `src/` 里的断点绑不上，先确认 `yarn build` 跑过、`dist/extension.js` 存在。

在 Development Host 里手工验证的内容：

1. 打开一个 `.clx` 文件：语法高亮立即可用；状态栏下载完成后补全与 hover 正常。
2. `#include ` 后触发补全能列出同目录文件；`__gfx__` 段不出现语法错误。
2. 输入 `template` 能出现模板片段，新建文件后首行带设备规格标识。
3. 点击编辑器右上角的运行按钮或按 `F5`，模拟器启动，并在文件的同级目录生成 `.rom`。
4. 左侧切到 Run and Debug 启动调试。断点应显示为已填充的圆点并落在原始 `.clx` 文件上。判断文件是否加载成功看 `<文件名>.clx.rom` 是否生成，不要看 3563 端口 —— 加载失败时它也会监听。调试期间不要另外连接 3563 端口，第二个连接会挤掉扩展自己的连接，看起来像调试功能坏了。

## 检查

```bash
yarn typecheck   # tsc --noEmit
yarn lint        # eslint src
yarn test        # node:test，覆盖协议解析、行号映射、DAP 请求处理
yarn check-public  # 确认没有本机路径/内网地址/凭据；:history 连 git 历史一起查
yarn e2e         # 需要图形界面和模拟器，见下
```

交付前这几条都要过，而且 `yarn package` 必须能出 vsix。

### 敏感信息检查

**这个仓库是 public。** 代码、文档、提交历史、GitHub Releases 上的 asset 全部对外
可见，而且**历史删不掉** —— 把文件从工作区删掉之后，`git log` 里依然能翻出来。

`scripts/check-public.mjs` 拦四类：

| 类别 | 例子 |
|---|---|
| 本机绝对路径 | `/Users/<name>/...`、`C:\Users\<name>` |
| 内网地址 | `10.x`、`192.168.x`、`*.local`、`*.internal`、`*.vicp.net`、`http://host:port/svn/` |
| 凭据 | `ghp_*`、`github_pat_*`、私钥块、`password = "..."` 这类硬编码 |
| 本地垃圾 | `.DS_Store`、`__MACOSX`（打包脚本另有独立检查） |

三个触发点：

- **pre-commit**：只查暂存区（`--staged`），快
- **CI**：`yarn check-public --history`，连整个 git 历史一起查
- **手动**：`yarn check-public` 查全部被追踪的文件

误报的处理方式分两种：

- **当前文件**：在那一行加 `allow-public` 注释，检查会跳过整行
- **历史里的旧内容**（文件已改或已删，标记加不进去）：在
  `scripts/check-public.mjs` 的 `HISTORY_ALLOWLIST` 里登记路径，**并写明理由**。
  只登记路径不登记内容 —— 那些文件在当前工作区仍要过完整检查。

不要因为"懒得看"就往白名单里加东西。这个脚本的全部价值在于它真的会失败。

类型检查只走 `tsc --noEmit`，不要把 tsc 的产物写到磁盘；构建统一用 esbuild。

### 端到端冒烟测试

`yarn e2e` 在隔离的 VS Code Extension Development Host 里跑一次真实调试：断点、调用栈、Watch、Globals、`!input?`、截图，并断言不生成 `debug_temp.clx`、不往工作区写 BMP。

**不进 CI**：需要图形界面和模拟器二进制（模拟器没有 Linux 版）。本地改完调试相关代码应该跑一次。

它固化了几条只有手工验证时才会踩的坑：

- `settings.json` 必须在 `<user-data-dir>/User/` 下。放到 `<user-data-dir>/` 根不报错、也没人读，表现是"配置没生效"。
- 模拟器必须已缓存，或用 `CLX_E2E_EMULATOR` 指本地副本。headless 下首次下载的确认框是模态的，会卡死。
- `.rom` 的实际文件名是 `<文件名>.clx.rom`。
- 卡带必须有 `__lua__` 区段，否则模拟器静默回落到 BIOS 菜单，`src __lua__` 返回的是菜单源码。

环境变量：`CLX_E2E_CODE` 指定 VS Code、`CLX_E2E_EMULATOR` 指定模拟器、`CLX_E2E_KEEP=1` 保留临时目录看日志。

### 测试

测试在 `test/`，用 Node 内置的 `node:test`，零额外依赖。`yarn test` 会调 `scripts/run-tests.mjs`：先用 esbuild 把每个 `.test.ts` 打成 CJS 放到临时目录，再交给 `node --test`。

之所以要预打包而不是直接跑 TS：Node 22 的 `--experimental-strip-types` 不支持构造函数参数属性（`constructor(private readonly x)`）这类语法。用 esbuild 是现有依赖，比引入 ts-node 或给测试单配一套 tsconfig 都简单。

**能测的前提是 module 不 import `vscode`。** `debugChannel.ts`、`luaProtocol.ts`、`lineMapping.ts`、`luaValue.ts`、`testAutomation.ts`、`emulatorBundle.ts` 都遵守这条，所以在普通 Node 里就能跑。要在这些文件里用编辑器能力时，从参数注入结构类型（参考 `emulatorBundle.ts` 的 `ProgressSink` / `Cancellation`），不要 import `vscode`。

### 为什么 TypeScript 停在 5.9.3

`typescript` 目前锁在 **5.9.3**，而 npm 上的 `latest` 已经是 7.x。这是有意停住的，不要当成遗漏。

TypeScript 7 是原生重写版，通过平台二进制分发。它在 `package.json` 里只声明 `"./lib/version.cjs"` 作为主入口，**`require("typescript")` 因此只返回 `{ version, versionMajorMinor }`** —— 编译 API 全在 `./unstable/*` 下，没有稳定的 `createSourceFile` / `Program`。

`@typescript-eslint` 启动时要 `require("typescript")` 拿完整 API，所以直接升 TS 7 会让 `yarn lint` 抛 `typescript-eslint does not support TS 7.0`。官方推荐的共存办法是把 `typescript` 指向 TS 6 的兼容包、TS 7 用别名提供 `tsc`：

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

**这套方案在 npm 下验证可用**（`tsc` 跑 7.0.2，eslint 用 TS 6 API，两者都正常、无 peer 冲突），但 **yarn 1 不支持 npm alias 语法** —— 在空白项目上也会报 `Received malformed response from registry for undefined`。

所以现状是：升 TS 7 必须同时换包管理器（yarn 4 或 npm）。而 TS 7 的收益主要是 `tsc` 提速，这里 `yarn typecheck` 本来只要 1.4 秒，感知不到；丢掉 lint 的代价却是实打实的。等哪天某个依赖真的要求 TS 7，再连同包管理器一起换更划算。

要在 5.9.3 上继续：`@typescript-eslint@8` 的 peer 范围是 `typescript >=4.8.4 <6.1.0`，5.9.3 在里面，lint 可以正常用。

## 打包

```bash
yarn package
```

在 `.artifacts/` 生成 `clx-language-<version>.vsix`，已被 git 忽略。打包时会自动执行 `vscode:prepublish`，把 `src/extension.ts` 压缩打包进 `dist/extension.js`。

`dist/` 和 `.artifacts/` 的分工：`dist/` 放**会被装进插件包**的构建产物（`extension.js`），`.artifacts/` 放**交出去**的东西（模拟器 tar.gz、vsix）。不要把 vsix 放进 `dist/`：`vscode:prepublish` 每次先 `rimraf dist`，上一份产物会被一起删掉。

依赖分两层：运行时用到的 `@vscode/debugadapter`、`@vscode/debugprotocol`、`vscode-languageclient` 在 `dependencies`，其余在 `devDependencies`。esbuild 把它们全部内联进 `dist/extension.js`，所以打包要带 `--no-dependencies`，不然 vsce 会额外塞一份 `node_modules`（56 文件 → 409 文件）。`yarn package` 已带这个标记。

插件包的内容由 `.vscodeignore` 控制。下面这些必须留在排除列表里：

- `AGENTS.md` 和 `docs/**`：只需要给开发者看，不需要分发给用户。
- `.github/**`：vsce 内置的 `.github` 排除项匹配不到目录下的文件，必须显式写。
- `src/**` 和 `tsconfig.json`：`src/` 已经被 esbuild 打成一个 `dist/extension.js`，运行时没有读者。

检查包内容：

```bash
unzip -l .artifacts/clx-language-*.vsix
```

出厂内容应该只有 `dist/`、`res/`、`syntaxes/`、`snippets/`、`language-configuration.json` 和几个 md。出现 `.ts`、`out/` 或 `tsconfig.json` 就说明 `.vscodeignore` 漏了。CI 的 `Build VSIX` workflow 会断言同样的内容。

模拟器归档里的可执行位由 `src/emulator/emulatorBundle.ts` 按 tar 头的 mode 还原，所以打包脚本必须在 macOS/Linux 上运行（保持源文件权限），不要用会丢权限的工具重新压缩。`scripts/pack-emulator.mjs` 会拒绝 symlink 和非普通文件。

`src/emulator/emulatorBundle.ts`、`src/debug/debugChannel.ts`、`src/debug/luaProtocol.ts`、`src/debug/lineMapping.ts` 都不 import `vscode`，所以可以直接在普通 Node 里测试，不必启动 VS Code。跑 `yarn test` 即可（node:test，由 `scripts/run-tests.mjs` 用 esbuild 预打包后执行）：

```bash
# 单独打包成 CJS 后即可 require，验证 tar 解析和路径穿越防护
esbuild src/emulatorBundle.ts --bundle --format=cjs --platform=node --outfile=/tmp/eb.js
node -e "const {extract}=require('/tmp/eb.js'); /* ... */"
```

它导出的 `parseManifest`、`findBundle`、`locateBundle`、`provision`、`extract` 都是纯函数式的入口；进度和取消通过 `ProgressSink`、`Cancellation` 结构类型注入，测试传假对象即可。新增处理归档字节的逻辑必须留在这个文件里。

## 发布

发布由 GitHub Actions 完成，配置在 [`.github/workflows/publish.yml`](../.github/workflows/publish.yml)，通过 Marketplace Trusted Publishing（OIDC）认证，不需要在仓库里保存任何令牌。

触发方式：

- 推送 `v*` 开头的 tag
- 在仓库的 Actions 页手动运行 Publish workflow

发布步骤：

1. 在 `CHANGELOG.md` 顶部按现有格式添加一条：`### <版本> (YYYY-MM-DD)`。
2. 把 `package.json` 的 `version` 改成同一个版本号。
3. 提交并推送到 `main`。
4. 打 tag 并推送：

   ```bash
   git tag v<version>
   git push origin v<version>
   ```

5. 在仓库的 Actions 页确认运行结果。

workflow 里有一道校验：tag 必须等于 `v` 加上 `package.json` 里的版本号，否则会在发布前报错退出。这能避免 tag 和实际发布的版本对不上。

其他限制：

- 不要手动执行 `vsce publish`，也不要把任何令牌写进仓库或日志。
- 已经发布过的版本号不能重复使用。版本号只支持 `主版本.次版本.修订号`，不能带预发布后缀；发布时 `package.json` 的版本就是市场上的版本。
- 推送到 `main` 不会触发发布。

### Trusted Publishing 配置

如果需要在新的 publisher 上重新配置：

1. 用对 publisher 有权限的 Microsoft 账号登录 <https://marketplace.visualstudio.com/manage/publishers>。
2. 打开 **LifeSmart** publisher，选择 **Trusted Publishing**，展开 **Create**。
3. 按下面填写后点 **Create**：

   | 字段 | 值 |
   |---|---|
   | Policy name | 任意描述性名称，例如 `clx-language release` |
   | Repository owner | `nan20110923` |
   | Repository | `clx-language` |
   | Workflow | `publish.yml` |
   | Environment | 留空 |

4. 大小写要和 GitHub 完全一致，Repository 不带 owner 前缀。如果仓库是私有的，创建策略后要在 48 小时内跑一次 workflow 完成激活。

## 文档说明

| 文件 | 读者 | 说明 |
|---|---|---|
| `README.md`、`README_zh.md` | 扩展用户 | 用户指南。`README.md` 就是插件市场的 DETAILS 页面 |
| `docs/development.md` | 开发者 | 本文件 |
| `docs/luals.md` | 维护语言服务器的人 | **LuaLS 的打包、补丁和升级手册。** 改 `res/luals/clx.lua`、升级 LuaLS、排查语言功能问题前先读它 |
| `docs/test-automation.md` | 写卡带做回归测试的人 | 注入输入与截图的命令参考。README 里只留了一行指引 |
| `docs/adr/` | 开发者 | 决策记录。0001 模拟器包外置、0002 断点打在原文件、0003 换掉 Java 服务器 |
| `AGENTS.md` | 编码代理、开发者 | 命令、约定和验证清单 |
| `CHANGELOG.md` | 扩展用户 | 发布记录，同时显示在插件的 Changelog 页 |
