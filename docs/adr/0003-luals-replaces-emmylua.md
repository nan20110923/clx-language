# 0003. 用 LuaLS 替换 EmmyLua 语言服务器

状态：已采纳（2026-11-26）

## 背景

扩展的语言服务器一直是 `server/lua_ls.jar`：2023 年基于 EmmyLua-LanguageServer
0.5.16 改出来的一份 jar，通过 `java -cp` 启动。

它带来三个长期问题：

1. **用户必须预装 JDK 11+**，否则扩展只有语法高亮。
2. **jar 占 vsix 的 97%**（8.46MB / 8.71MB），而它本身是一份无法追踪来源的二进制。
   逐 class 对比上游 0.5.16 后发现，仓库版只多 8 个 class，其中唯一真正的 CLX
   功能是 `ClxRefFileCompletionProvider`（文件名补全）；其余是解析器接口改动
   与重编译副产物。
3. **CLX 的语义几乎全在 `res/std` 的存根里**，而不是在服务器里。换言之，那份
   9MB 的 jar 对 CLX 的支持并没有想象中多。

更严重的是存根本身已经过时。模拟器的 `c/coloX/guide/lua.md` 写明 **CLX 使用定制版
Lua 5.4**（32 位整数 + 32 位浮点），而 `res/std` 是 2018 年的 Lua 5.1 存根：

| 存根 | 问题 |
|---|---|
| `os.lua`（11 个函数） | CLX 里 os 库**完全不存在**，时间要用 `stat(90..96)` |
| `io.lua`（18 个函数） | CLX 里 io 库**完全不存在**，文件访问用 `__resread`/`__reslist` |
| `global.lua` | `dofile`/`loadfile` 是报错占位；`load` 实际叫 `loads` |
| `table.lua` | 只有 5.1 的函数集 |

也就是说：旧配置会主动教用户调用不存在的东西。

## 决定

换成 **LuaLS 3.19.2**（lua-language-server，MIT），按需下载到
`globalStorageUri/luals/`，并从 vsix 中删除 jar。

### 为什么是 LuaLS

实测对比过 LuaLS 3.19.2 与 emmylua_ls 0.25.1（Rust 版 EmmyLua）：

- LuaLS 对 `.clx` 文件能正常给出 hover / 补全 / 签名 / 语义着色
- emmylua_ls **对 `.clx` 扩展名一律返回空结果**，即使日志显示 `extensions: ["clx"]`
  已加载、模块正则也扩到了 `.clx`。这个缺陷卡在索引层，绕不过去
- 两者都是 Rust/C++ 单二进制，都不需要运行时；LuaLS 的 meta 体系更成熟

### 为什么按需下载

沿用 ADR 0001 对模拟器的决定：二进制不随 vsix 分发。三种方案里选了最省的一次：

| 方案 | vsix | 首次使用 |
|---|---|---|
| 全打进 vsix（三个架构） | ~13MB | 离线可用 |
| **按需下载（采纳）** | **193KB** | 后台静默拉 ~1MB |
| 脚本进包、只下二进制 | ~3.2MB | 拉 1MB，但装两份要合并 |

关键差异：语言服务器在**打开 .clx 时就要用**，不像模拟器是"点运行才需要"。
所以这里**不弹确认框**，只显示状态栏进度。下载失败或用户跳过时静默降级为
"没有语言功能，语法高亮照常"。

### .clx 格式怎么处理：官方插件，零源码改动

`.clx` 不是合法 Lua（设备规格抬头 + `__gfx__` 十六进制段），直接喂给 LuaLS 会得到
30 条语法错误。

LuaLS 有官方插件机制（`Lua.runtime.plugin`），其中 `OnSetText` 事件可以改写文件
文本。`res/luals/clx.lua` 用它把 `__lua__` 段之外的每一行替换成**等宽注释**：

```
coloX-4P        ->  --loX-4P
__gfx__         ->  --     （用空格补齐到原宽度）
00001111        ->  --001111
```

行数与每行列号完全不变，所以 LuaLS 报回来的位置能直接对上用户看到的原文。

插件返回 **diff 表**而不是整串，让 LuaLS 自己维护位置映射
（`script/string-merger.lua` 的 `getOffset`/`getOffsetBack`）。返回整串的话
`diffInfo` 为空，位置换算退化成原样透传 —— 现在因为等宽替换恰好正确，但那是
巧合，一旦需要插入或删除内容就会错位。

**没有改 LuaLS 一行源码。** 这是刻意的：升级 LuaLS 时只需重跑打包脚本，
不需要重新 diff 任何文件。

### 为什么路径补全在 VS Code 侧

`#include` / `#blob` / `#png` 后面的路径补全没有做进 LuaLS，而是在
`src/language/includeCompletion.ts` 里注册了一个 CompletionItemProvider。

理由：LuaLS 的插件机制只开放 `OnSetText` / `OnTransformAst` / `ResolveRequire`
三个事件，**没有补全钩子**；要加就得改它的源码。而 VS Code 会把所有
CompletionItemProvider 的结果合并，所以两边共存没有冲突，且这段逻辑能用
`node:test` 直接测。

补全规则来自模拟器源码 `c/coloX/src/coloX_cart.c`：

- 只有三条指令，且**必须带一个空格**（`memcmp(buf, "#include ", 9) == 0`）
- 指令后的文本与 cart 所在目录直接做字符串拼接，不解析 `..`
- 三条指令在任何区段都能用，不只是 `__lua__`
- 不递归展开

因为指令不区分文件类型，候选就是「该目录下的一切」，不按扩展名过滤。

### 为什么用 --configpath 而不是 .luarc.json

生成的配置写在 `globalStorageUri/luals/config.lua`，用 `--configpath` 传给 LuaLS。

- 不往用户的源码目录写文件
- 用户工作区里已有的 `.luarc.json` / `.emmyrc.json` 不影响 CLX 的行为
- **代价**：那些配置对 `.clx` 也不生效。对 CLX 这个专属语言是可接受甚至更好的
  取舍 —— 用户不会期望 `.luarc.json` 能配置一个非 Lua 语言

### 为什么删掉 annotator

旧实现靠自定义的 `emmy/annotator` 请求画五种装饰（参数、全局、类型、upvalue、
未使用）。LuaLS 没有这个方法，但它原生提供：

- 语义着色：`parameter` / `variable` / `method` / `function` + `declaration` /
  `global` / `defaultLibrary` 修饰符
- `unused-local` / `unused-function` 诊断，带 `Unnecessary` tag（VS Code 自动淡显）

覆盖率对比后决定删除 `annotations.ts` 与五个 `clx-language.colors.*` 设置。

**丢失的功能：upvalue 下划线。** LuaLS 不区分 upvalue 和普通变量；要保住它得
自己写一套作用域分析，工作量和 bug 面都不划算。

**替代方案**：自定义颜色改用 VS Code 标准的
`editor.semanticTokenColorCustomizations` —— 可发现、可搜索，比自造的五个设置更好。

## 打包裁剪

上游发行包 21MB，其中 `meta/` 占 17MB。裁剪后 ~1MB（压缩后）。

关于 `meta/` 有一个容易搞错的事实：

- `meta/template/*.lua` 是**标准库定义的源码模板**，必须保留（112KB）。
  LuaLS 启动时按 `Lua.runtime.version` / 界面语言 / 编码从它生成标准库定义到
  `LLS_META_PATH`。
- `meta/Lua 5.4 en-us utf8/` 之类的目录**不是发行包内容**，是启动时生成的缓存。
  验证方式：重新解压同一份 tarball 并没有它，只有跑过一次的目录才会有。
- `meta/default utf8/`（9.8MB）是 Unity/.NET 绑定，`meta/3rd/`（4.8MB）是
  love2d/Cocos 等第三方框架，`meta/spell/`（1.3MB）是英文词典。全部与 CLX 无关。
- `locale/` 必须保留：缺失会导致启动即错（实测）。

顺带的好处：删掉 `default utf8` 后 `print()` 的重复签名消失了（.NET 的 print
与 CLX 的 print 撞车）。

## 后果

好的：

- **去掉 JDK 依赖**：用户装完扩展即可用
- **vsix 从 8.7MB 降到 193KB**（-97.8%）
- 存根按 CLX 的真实方言重建：`os`/`io` 被禁用、`loads` 与 `printh` 有声明、
  五个转换函数补上
- 中文注释随界面语言切换
- 不再维护改过的二进制

坏的 / 需要接受的：

- 首次打开 `.clx` 有约 1MB 的后台下载
- upvalue 下划线没了
- 用户工作区的 `.luarc.json` 对 `.clx` 不生效
- LuaLS 升级需要重跑 `scripts/pack-luals.mjs` 并验证插件仍适用

## 相关

- `docs/adr/0001-emulator-bundles-outside-vsix.md` —— 按需下载的先例；
  但它的"归档名不带 arch"规则**不适用于** LuaLS（LuaLS 按 arch 分发）
- `src/artifact/bundle.ts` —— 两个产物共用的下载/校验/解压/原子替换
- `src/language/lualsBundle.ts` —— LuaLS 的清单与就绪判定
- `src/language/lualsConfig.ts` —— 生成 configpath 的内容
- `res/luals/clx.lua` —— OnSetText 插件
- `scripts/pack-luals.mjs` —— 打包与裁剪
