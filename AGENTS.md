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
| 类型检查 | `yarn typecheck`（`yarn test` 是同一个命令） |
| 打包 | `yarn package`，在根目录生成 `clx-language-<version>.vsix` |
| 本地运行 | 在 VS Code 里按 `F5`，启动配置是 `Extension` |

不要使用的命令：

- `npm install`、`npm ci`：仓库只用 yarn。npm 会重新生成 `package-lock.json`，并把 `yarn.lock` 改写成 npm 的格式。`npm run <script>` 没有问题。
- `yarn lint`：仓库里没有 ESLint 配置文件，会直接报错。
- `yarn compile`：旧的 tsc 流程，输出到 `out/`，会覆盖已入库的 `out/extension.js` 并产生新的未跟踪文件。现在的构建走 esbuild。

## 目录

```text
src/extension.ts              扩展入口，esbuild 打包成 dist/extension.js（package.json 的 main）
src/debugger/                 调试功能
  ClxDebugSession.ts          调试会话，和模拟器的调试通道通信
  ClxDebugProvider.ts         解析 launch 配置，显示“等待连接”提示
  activeDebug.ts              注册调试适配器工厂和 inline values
src/annotator.ts              参数名等注解
src/findJava.ts               查找 Java
syntaxes/.tmLanguage.json     TextMate 语法
snippets/snippets.json        代码片段
res/std、res/std_zh            标准库存根，英文和中文
server/lua_ls.jar             语言服务器
debugger/                     内置模拟器：osx（ColoPlay）、nature/osx、win32
docs/                         开发与部署文档，不进插件包
dist/                         打包产物，不入库
out/                          早期的编译产物，已入库
```

## 运行时要点

- **构建**：`vsce package` 和 `vsce publish` 会自动执行 `vscode:prepublish` 脚本，把 `src/extension.ts` 压缩打包到 `dist/extension.js`。
- **语言服务器**：`server/lua_ls.jar` 是 EmmyLua-LanguageServer 的修改版，用 Java 启动，需要 Java 11 或更高。标准库存根按 VS Code 的界面语言选择，中文用 `res/std_zh`，其他语言用 `res/std`。
- **模拟器的启动方式**：用 `child_process.spawn` 传参数数组，`coloXtool -d <目录>/ -r <文件>`，调试时加 `-x`。不要改回拼接 shell 字符串的写法：Windows 的 cmd.exe 不认单引号，路径里的引号会被当成路径的一部分。
- **模拟器的选择**：由设置 `clx-language.debugger` 和文件首行的设备规格决定。首行是 `coloX-32…` 用 Nature，其余用 ColoPlay；设置成 `Custom` 时用 `clx-language.debuggerCustomPath`；Windows 只有 ColoPlay。
- **调试适配器是内联的**：`src/debugger/activeDebug.ts` 注册的工厂返回 `DebugAdapterInlineImplementation`，调试会话运行在扩展进程里。`package.json` 里 `debuggers[0].program` 指向的 `out/debugger/ClxDebugAdapter.js` 并不存在，这是遗留配置，不需要补这个文件。
- **调试通道**：本机 TCP 3563，只允许一个客户端连接。启动调试会在工作区里生成 `debug_temp.clx`。

## 约定

- `dist/` 和 `*.vsix` 不入库。
- `out/` 是早期遗留的编译产物，会随包发布，但运行时不使用。除非任务明确要求，不要清理或重新生成它。
- `debugger/` 下 macOS 的可执行文件（`coloXtool` 和部分 dylib）在 git 里是 `100755`。替换这些文件时保持可执行位（`git update-index --chmod=+x <path>`），否则用户安装后模拟器无法启动。
- 代码风格跟随所在文件现有的缩进和写法，不要顺手格式化整个文件。注释里中英文都有，保持原样即可。
- 工作区设置把 `main` 设为受保护分支（`.vscode/settings.json`），在 VS Code 里直接提交到 `main` 会提示新建分支。

## 打包规则

插件包的内容由 `.vscodeignore` 控制。下面这些必须留在排除列表里：

- `AGENTS.md` 和 `docs/**`：只需要给开发者看，不需要分发给用户。
- `.github/**`：vsce 内置的 `.github` 排除项匹配不到目录下的文件，必须显式写。

根目录的 `README.md` 就是插件市场的 DETAILS 页面，打包时会被改名成 `extension/readme.md`，所以不要把它加进排除列表。`README_zh.md` 也会随包发布，供插件内跳转使用。

## 验证改动

仓库没有自动化测试。交付前至少做完下面这些：

1. `yarn typecheck` 通过。
2. `yarn package` 成功。改动涉及打包内容时，用 `unzip -l` 检查生成的 vsix，确认该有的文件在、不该有的不在。
3. 改动涉及运行时行为时，按 `F5` 在 Extension Development Host 里实际验证：
   - 打开一个 `.clx` 文件，语法高亮和补全正常（本机需要 Java 11 或更高）。
   - 点击编辑器右上角的运行按钮，模拟器启动，并在文件的同级目录生成 `.rom` 文件。
   - 调试流程以 `debug_temp.clx` 是否出现作为就绪信号。

验证模拟器时的注意点：

- 判断文件有没有加载成功，看 `.rom` 文件，不要看 3563 端口有没有打开。加载失败时模拟器也会继续运行并监听端口。
- 调试会话期间不要另外连接 3563 端口。第二个连接会挤掉扩展自己的连接，看起来像调试功能坏了。
- 模拟器的 stdout 被管道捕获时是全缓冲的，只有它正常退出后才能读到启动时打印的内容。

## 发布

发布只通过 GitHub Actions 进行（`.github/workflows/publish.yml`），用 Marketplace Trusted Publishing 认证（`vsce publish --oidc`），不使用 PAT。

1. 在 `CHANGELOG.md` 顶部按现有格式添加一条：`### <版本> (YYYY-MM-DD)`。
2. 把 `package.json` 的 `version` 改成同一个版本。
3. 提交并推送，然后打 tag。tag 必须是 `v<版本>`，和 `package.json` 完全一致，否则 workflow 会在发布前报错。
4. 在仓库的 Actions 页确认运行结果。

- 不要手动执行 `vsce publish`，也不要把任何令牌写进仓库或日志。
- 已经发布过的版本号不能重复使用。版本号只支持 `主版本.次版本.修订号`，不能带预发布后缀。
- 只有推送 `v*` 开头的 tag 或手动触发才会发布，推送到 `main` 不会。
