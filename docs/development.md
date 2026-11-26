# 开发与部署

本文件面向维护 clx-language 的开发者，说明如何搭环境、构建、调试、打包和发布。扩展的用户说明见根目录的 [README.md](../README.md) 和 [README_zh.md](../README_zh.md)，编码代理的操作约定见 [AGENTS.md](../AGENTS.md)。

- 插件市场：<https://marketplace.visualstudio.com/items?itemName=LifeSmart.clx-language>
- 仓库：<https://github.com/nan20110923/clx-language>

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 22 或更高 | 打包和发布用的 `@vscode/vsce` 要求 22 以上，CI 使用 24 |
| yarn | 1.x | 仓库只使用 yarn |
| JDK | 11 或更高 | 运行语言服务器 `server/lua_ls.jar` |
| VS Code | 1.80 或更高 | 与 `package.json` 的 `engines.vscode` 一致 |

扩展本身运行在 Windows 和 macOS 上，模拟器没有 Linux 版本。打包和发布在 Linux 的 CI 上进行，那里只需要构建，不需要运行模拟器。

## 初始化

```bash
git clone https://github.com/nan20110923/clx-language.git
cd clx-language
yarn install
```

仓库只使用 yarn。不要运行 `npm install` 或 `npm ci`：npm 会重新生成 `package-lock.json`，并把 `yarn.lock` 改写成 npm 的格式。`npm run <script>` 不受影响。

## 目录结构

```text
src/                            TypeScript 源码，由 esbuild 打包成 dist/extension.js
  extension.ts                  扩展入口：注册命令、启动语言服务器、管理模拟器进程
  debugger/ClxDebugSession.ts   调试会话，与模拟器的调试通道（TCP 3563）通信
  debugger/ClxDebugProvider.ts  解析 launch 配置，显示“等待连接”提示
  debugger/activeDebug.ts       注册调试适配器工厂和 inline values
  debugger/FileUtil.ts          生成 debug_temp.clx
  annotator.ts                  参数名等注解
  findJava.ts                   查找 Java 可执行文件
  substitution.ts               展开 ${workspaceFolder} 变量
  languageConfiguration.ts      括号、注释、缩进规则
  lspExt.ts                     语言服务器相关的类型定义
syntaxes/.tmLanguage.json       TextMate 语法
snippets/snippets.json          代码片段
language-configuration.json     语言配置
res/                            图标和标准库存根：std 是英文，std_zh 是中文
res/emulator-manifest.json      模拟器包清单，指向 GitHub Releases
server/lua_ls.jar               语言服务器，基于 EmmyLua-LanguageServer 修改
scripts/pack-emulator.mjs       模拟器打包脚本
static/readme/                  README 图片，不进插件包
docs/                           开发、部署文档和决策记录
dist/                           esbuild 打包产物，不入库
out/                            早期的编译产物，已入库，运行时不使用
```

## 构建

```bash
yarn build    # 打包到 dist/extension.js，带 sourcemap
yarn watch    # 监听文件改动，自动重新打包
```

`package.json` 的 `main` 指向 `dist/extension.js`，所以 `dist/` 缺失时扩展无法激活，所有命令都会提示找不到。执行过一次 `yarn build` 即可。

### 运行时要点

- **语言服务器**：`server/lua_ls.jar` 用 Java 启动。Java 的查找顺序是设置项 `clx-language.JAVA_HOME`、环境变量 `JAVA_HOME`、`PATH`。标准库存根按 VS Code 的界面语言选择：中文用 `res/std_zh`，其他语言用 `res/std`。
- **模拟器的启动方式**：用 `child_process.spawn` 传参数数组，`coloXtool -d <目录>/ -r <文件>`，调试时加 `-x`。不要改回拼接 shell 字符串的写法：Windows 的 cmd.exe 不认单引号，路径里的引号会被当成路径的一部分，表现是 `EIE:open file err`。
- **模拟器不再随包分发**：1.1.0 起按需下载到 `context.globalStorageUri/emulators/ColoPlay-<platform>-<date>-<sha前8位>/`，由 `src/emulator.ts` 管理。首次下载前弹一次确认，之后静默复用缓存。缓存目录里写 `.complete` 标记，缺失或可执行文件不在就整个重下。

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
- **调试适配器是内联的**：`src/debugger/activeDebug.ts` 注册的工厂返回 `DebugAdapterInlineImplementation`，调试会话运行在扩展进程里。`package.json` 里 `debuggers[0].program` 指向的 `out/debugger/ClxDebugAdapter.js` 并不存在，这是遗留配置，不需要补这个文件。
- **调试通道**：本机 TCP 3563，只允许一个客户端连接。启动调试会在工作区里生成 `debug_temp.clx`。
- **运行成功与否的判断**：看文件同级目录是否出现 `.rom`，不要看 3563 端口有没有打开。加载失败时模拟器也会继续运行并监听端口。
- **macOS Gatekeeper**：官方 macOS 包是 ad-hoc 签名、未公证。插件通过 `https` 下载的文件不带 quarantine 属性，能直接跑；手工下载再指定路径的情形会被拦，需要 `xattr -d com.apple.quarantine`。

## 本地调试扩展

在 VS Code 里按 `F5`，启动配置是 `Extension`，会打开 Extension Development Host。

已知问题：`.vscode/launch.json` 的 `outFiles` 仍然指向 `out/`，而实际产物在 `dist/`。如果在 `src/` 里打的断点绑定不上，把它改成 `${workspaceFolder}/dist/**/*.js`。

在 Development Host 里手工验证的内容：

1. 打开一个 `.clx` 文件，语法高亮和补全正常（本机需要 Java 11 或更高）。
2. 输入 `template` 能出现模板片段，新建文件后首行带设备规格标识。
3. 点击编辑器右上角的运行按钮或按 `F5`，模拟器启动，并在文件的同级目录生成 `.rom`。
4. 左侧切到 Run and Debug 启动调试，以 `debug_temp.clx` 是否出现作为就绪信号。调试期间不要另外连接 3563 端口，第二个连接会挤掉扩展自己的连接，看起来像调试功能坏了。

## 检查

```bash
yarn typecheck   # tsc --noEmit
yarn test        # 与 typecheck 相同
```

仓库没有自动化测试，`yarn lint` 目前因为没有 ESLint 配置文件而不可用。改动后需要手工验证上面的流程。

不要运行 `yarn compile`：那是早期的 tsc 流程，输出到 `out/`，会覆盖已入库的 `out/extension.js` 并产生新的未跟踪文件。现在的构建走 esbuild。

## 打包

```bash
yarn package
```

在根目录生成 `clx-language-<version>.vsix`，已被 git 忽略。打包时会自动执行 `vscode:prepublish`，把 `src/extension.ts` 压缩打包进 `dist/extension.js`。

插件包的内容由 `.vscodeignore` 控制。下面这些必须留在排除列表里：

- `AGENTS.md` 和 `docs/**`：只需要给开发者看，不需要分发给用户。
- `.github/**`：vsce 内置的 `.github` 排除项匹配不到目录下的文件，必须显式写。

检查包内容：

```bash
unzip -l clx-language-*.vsix | head -40
```

模拟器归档里的可执行位由 `src/emulator.ts` 按 tar 头的 mode 还原，所以打包脚本必须在 macOS/Linux 上运行（保持源文件权限），不要用会丢权限的工具重新压缩。`scripts/pack-emulator.mjs` 会拒绝 symlink 和非普通文件。

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
| `AGENTS.md` | 编码代理、开发者 | 命令、约定和验证清单 |
| `CHANGELOG.md` | 扩展用户 | 发布记录，同时显示在插件的 Changelog 页 |
