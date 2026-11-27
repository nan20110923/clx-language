# LuaLS 语言服务器：打包、补丁与升级

本文是 LuaLS 这一层的维护手册。目标是：接到这个仓库的人不用重新研究一遍就能升级 LuaLS、
排查语言功能的问题、或者改 `.clx` 的解析行为。

决策背景（为什么换掉 Java、为什么选 LuaLS）见
[ADR 0003](adr/0003-luals-replaces-emmylua.md)，本文只讲怎么做和为什么这么做。

相关文件：

| 文件 | 职责 |
|---|---|
| `res/luals-manifest.json` | 清单：哪个平台/架构用哪个 asset，含 sha256 |
| `scripts/pack-luals.mjs` | 裁剪 + 打包 + 算 sha256 + 输出清单条目 |
| `scripts/pack-common.mjs` | 与模拟器打包共用的 tar/sha256 工具 |
| `res/luals/clx.lua` | LuaLS 插件：把 `.clx` 的非 Lua 段变成注释 |
| `src/language/lualsBundle.ts` | 清单校验、就绪判定、安装（纯逻辑，不 import vscode） |
| `src/language/lualsConfig.ts` | 生成 LuaLS 的 configpath 内容（纯逻辑） |
| `src/language/lualsServer.ts` | VS Code 适配：读清单、下载进度、写配置、启动规格 |
| `src/artifact/bundle.ts` | 下载/校验/解压/原子替换（与模拟器共用） |

---

## 1. 整体结构

```
GitHub Releases: luals-<version>
  luals-darwin-arm64-<ver>.tar.gz
  luals-darwin-x64-<ver>.tar.gz
  luals-win32-x64-<ver>.tar.gz
          │
          │  首次打开 .clx 时下载（~1MB，静默 + 状态栏）
          ▼
globalStorageUri/luals/
  LuaLS-<platform>-<arch>-<ver>-<sha8>/     ← 解压后的服务器
    bin/ script/ locale/ main.lua meta/template/
    .complete                                ← 安装完成的标记
  config.lua                                 ← 每次启动重写
  meta/                                      ← LuaLS 自己生成的标准库定义
  log/                                       ← LuaLS 日志
```

**LuaLS 源码一行未改。** `.clx` 的格式差异完全由 `res/luals/clx.lua` 这个插件处理。
这是刻意的：升级 LuaLS 时不需要重新 diff 任何上游文件。

---

## 2. 补丁：只做一件事，靠官方插件机制

### 它解决的问题

`.clx` 不是合法 Lua：

```
coloX-4P            ← 设备规格抬头
version 1
style: game
__lua__             ← Lua 从这行之后开始
function _draw() ... end
__gfx__             ← 精灵数据的十六进制块
0000111122223333
__map__
```

直接喂给 LuaLS 会得到 30 条语法错误（抬头是表达式错误，十六进制块被当成数字）。

### 做法

`OnSetText` 把 `__lua__` 段之外的每一行替换成**等宽注释**：

| 原文 | 替换为 |
|---|---|
| `coloX-4P` | `--loX-4P` |
| `__gfx__` | `--` + 5 个空格（补齐到原宽度） |
| `0000111122223333` | `--00111122222222` |

关键约束：**行数与每行列号必须完全不变**。这样 LuaLS 报回来的位置（诊断、补全、
跳转）能直接对应到用户看到的原文，不需要任何偏移换算。

实测：真实 cart 的诊断从 30 条降到 0。

### 为什么返回 diff 而不是整串

LuaLS 的 `OnSetText` 两种返回值都接受：

- 返回 **字符串** → LuaLS 用它替换文本，但**不建立位置映射**
- 返回 **diff 表** → LuaLS 记下 `diffInfo`，之后所有位置换算走
  `script/string-merger.lua` 的 `getOffset` / `getOffsetBack`

选了 diff。因为等宽替换"恰好"让位置不变，如果返回整串，正确性依赖这个巧合 ——
将来若需要插入或删除内容（比如给 `__lua__` 段补一行），整串方案会静默错位，
而 diff 方案由机制保证。

diff 的 `start` / `finish` 是 **1-based 字节偏移**（`string-merger.lua` 用
`text:sub(cur, diff.start - 1)` 切分，Lua 的 string 按字节索引）。所以数长度
必须用 `#line` 而不是 `utf8.len` —— 中文变量名会让字符数和字节数不等。

### 为什么整行替换而不是保留尾部

更"省"的写法是 `'--' + line.slice(2)`，但危险：数据行若以 `[[` 开头，
加上 `--` 就变成 `--[[`，意外打开一个长注释，把后面所有代码吞掉。
整行换成空格没有这个问题。

### 只处理 .clx

同一个 LuaLS 进程也可能打开工作区里的 `.lua` 文件（`#include` 的目标就是普通
`.lua`）。那些文件是纯 Lua，不能改动，否则行号会错。所以插件第一件事就是看扩展名。

---

## 3. 配置：用 --configpath 注入

生成的配置在 `globalStorageUri/luals/config.lua`，启动时
`--configpath=<path>` 传进去。内容由 `src/language/lualsConfig.ts` 生成。

关键项：

| 配置 | 值 | 为什么 |
|---|---|---|
| `runtime.version` | `'Lua 5.4'` | CLX 是定制版 Lua 5.4（32 位数值） |
| `runtime.plugin` | `res/luals/clx.lua` 的绝对路径 | 我们的 OnSetText 插件 |
| `runtime.builtin.os` / `.io` | `'disable'` | CLX 里这两个库**不存在** |
| `workspace.library` | `res/clx-std/<lang>` + `res/clx-lua/<lang>` | CLX API 与方言差异两层存根 |
| `diagnostics.libraryFiles` | `'Disable'` | 存根自己的诊断不是用户的问题 |
| `diagnostics.globals` | `_init` / `_update` / `_draw` … | 模拟器回调，不该提示未定义 |

### `os` / `io` 的 disable 是"排除类型检查"，不是删文件

`Lua.runtime.builtin` 设为 `disable` 后，LuaLS 在
`script/library.lua:compileSingleMetaDoc` 里返回 `(text, false)` —— 文件**照样**
生成到 `meta/` 下，但不加入 `metaPaths`，所以不参与类型检查。效果是 hover 显示
`(global) os: unknown`，这正是 CLX 的真实情况。

### 为什么不写 .luarc.json

- 不往用户源码目录写文件
- 用户工作区已有的 `.luarc.json` 不影响 CLX 的行为，结果确定
- **代价**：那些配置对 `.clx` 也不生效。对 CLX 这个专属语言可接受

### 插件信任弹窗

LuaLS 默认会对插件弹一次信任确认。这里通过
`initializationOptions: { trustByClient: true }` 跳过 —— 插件是扩展自己提供的，
让用户为它点确认没有意义。对应 LuaLS 的 `script/plugin.lua:checkTrustLoad` 与
`script/client.lua:getOption`。

---

## 4. 路径补全为什么在 TypeScript 侧

`#include` / `#blob` / `#png` 后面的路径补全**没有**做进 LuaLS，而是在
`src/language/includeCompletion.ts` 注册了一个 VS Code `CompletionItemProvider`。

原因：LuaLS 插件只开放三个事件 —— `OnSetText`、`OnTransformAst`、`ResolveRequire`，
**没有补全钩子**。要做进去就得改它的源码。而 VS Code 会把所有 provider 的结果合并，
所以两边共存没有冲突（LuaLS 在 `#include ` 后面看到的是注释，本来就不返回东西）。

附带好处：这段逻辑能用 `node:test` 直接测，Lua 侧跑在子进程里的代码测不了。

补全规则来自模拟器源码 `c/coloX/src/coloX_cart.c`：

- 只有三条指令，且**必须带一个空格**（`memcmp(buf, "#include ", 9) == 0`）
- 指令后的文本与 cart 所在目录直接做字符串拼接，不解析 `..`
- 三条指令在任何区段都能用，不只是 `__lua__`
- 不递归展开

因为指令不区分文件类型，候选就是「该目录下的一切」，**不按扩展名过滤**。

---

## 5. 打包：为什么裁 meta/，以及一个容易搞错的事实

上游发行包 21 MB，其中 `meta/` 占 17 MB。裁剪后压缩包约 1 MB。

### `meta/Lua 5.4 en-us utf8/` 不是包内容

这是最容易搞错的地方。**它是 LuaLS 启动时生成的缓存**，不是发行包自带的。

验证方法：重新解压同一份 tarball，**不会有**这个目录；只有跑过一次的目录才有。

生成机制（`script/library.lua:initBuiltIn`）：LuaLS 把 `meta/template/*.lua`
当作带预处理指令的源码模板，按 `Lua.runtime.version` / 界面语言 / 编码编译出标准库
定义，写到 `$LLS_META_PATH`。

所以打包时**必须保留 `meta/template/`，其余全部可以删**。

### meta/ 下各目录的实际内容

跑过之后看到的目录（别被名字骗）：

| 目录 | 体积 | 内容 | 处理 |
|---|---|---|---|
| `template/` | 112 KB | **标准库定义的源码模板** | **必须保留** |
| `default utf8/` | 9.8 MB | 100% Unity/.NET 绑定（`System.*`、`UnityEngine.*`、`CS.lua`） | 删 |
| `3rd/` | 4.8 MB | love2d、Cocos4.0、OpenResty、Jass、lovr、Defold、luv、skynet… | 删 |
| `spell/` | 1.3 MB | 英文拼写检查词典 | 删 |

`default utf8` 这个名字有误导性 —— 里面没有一个 Lua 标准库文件。

删掉它还有额外好处：`print()` 的重复签名消失了（.NET 的 `print` 与 CLX 的 `print` 撞车，
在 VS Code 里会看到两个候选）。

### `locale/` 不能删

实测缺了它 LuaLS 启动即错（`directory_iterator: "locale": No such file or directory`，
`script/language.lua:7`）。它只有 708 KB。

### 裁包后的内容

```
bin/           1.0 MB   可执行文件（各平台不同）
script/        2.2 MB   LuaLS 本体（明文 Lua + 解析器）
locale/        708 KB   语言包，不能删
meta/template/ 112 KB   标准库源码模板
main.lua              入口
debugger.lua          不用，但很小
LICENSE               MIT
```

---

## 6. 发布新版本 LuaLS：完整流程

LuaLS 大约每季度发一版（3.19.0 → 3.19.1 → 3.19.2 各自间隔 1–2 个月，每版只修
bug 不加 API）。升级时按下面走。

### 6.1 下载并解压上游包

LuaLS 按 **平台 + 架构** 分发，一平台不止一份。

```bash
VER=3.19.2
mkdir -p /tmp/luals-{darwin-arm64,darwin-x64,win32-x64}

curl -L -o /tmp/a.tgz https://github.com/LuaLS/lua-language-server/releases/download/$VER/lua-language-server-$VER-darwin-arm64.tar.gz
curl -L -o /tmp/b.tgz https://github.com/LuaLS/lua-language-server/releases/download/$VER/lua-language-server-$VER-darwin-x64.tar.gz
curl -L -o /tmp/c.zip https://github.com/LuaLS/lua-language-server/releases/download/$VER/lua-language-server-$VER-win32-x64.zip

tar xzf /tmp/a.tgz -C /tmp/luals-darwin-arm64
tar xzf /tmp/b.tgz -C /tmp/luals-darwin-x64
unzip -q /tmp/c.zip -d /tmp/luals-win32-x64
```

### 6.2 打包（自动裁剪）

```bash
node scripts/pack-luals.mjs --dir /tmp/luals-darwin-arm64 --platform darwin --arch arm64 --version $VER
node scripts/pack-luals.mjs --dir /tmp/luals-darwin-x64  --platform darwin --arch x64   --version $VER
node scripts/pack-luals.mjs --dir /tmp/luals-win32-x64   --platform win32  --arch x64   --version $VER
```

脚本会：

- 校验上游目录结构（`bin`、`script`、`locale`、`main.lua` 必须存在）
- 确认可执行文件在（`bin/lua-language-server` 或 `.exe`）
- 裁 `meta/`，只留 `template/`
- 拒绝 symlink 和非普通文件（解压端只处理普通文件和目录）
- 用 `tar --format=ustar` 打包（BSD tar 的扩展格式解压端不认）
- 算 sha256 与体积，写出 `.artifacts/<asset>.json`

输出示例：

```
Archive:  .artifacts/luals-darwin-arm64-3.19.2.tar.gz
Entry:    .artifacts/luals-darwin-arm64-3.19.2.tar.gz.json
Size:     0.97 MB
SHA-256:  c6279c88...
Files:    291
meta kept: 20 files from meta/template
```

**必须三个平台都打。** 只发一个的话，另外两个平台的用户没有语言功能。

### 6.3 上传 Release

```bash
gh release create luals-$VER \
  .artifacts/luals-darwin-arm64-$VER.tar.gz \
  .artifacts/luals-darwin-x64-$VER.tar.gz \
  .artifacts/luals-win32-x64-$VER.tar.gz \
  --title "LuaLS $VER (trimmed for CLX)" \
  --notes "..."
```

**已发布的 asset 永久不删。** 旧版扩展在冷缓存时指向它发布时的那个 tag，
删掉就会让那些用户无法下载。要与新版本共存就发新 tag。

### 6.4 更新清单

把三个 `.artifacts/luals-*.json` 的内容合并进 `res/luals-manifest.json`，
同时改 `release` 字段为新 tag：

```json
{
  "release": "luals-3.19.2",
  "baseUrl": "https://github.com/nan20110923/clx-language/releases/download",
  "bundles": [ ... ]
}
```

清单里的 `arch` **必须**有值。它与模拟器清单的关键差异：模拟器只有 x86_64
二进制（macOS 靠 Rosetta），所以刻意不带 arch；LuaLS 按架构分发，不能套用那条规则。

### 6.5 验证

升级后至少确认这几项（**不要只看包能不能下下来**）：

1. **插件仍然生效** —— 打开一个真实 `.clx`，`__gfx__` 段不应出现语法错误。
   如果出现，说明 `OnSetText` 的接口变了，见下面第 8 节。
2. **位置映射正确** —— 故意在 `__lua__` 段里写一个类型错误（比如
   `local c = pget(1,2)` 然后 `circfill(1,1,1,c)` 且存根把 `pget` 标成返回
   nil），诊断应该落在**原文**的对应行，不是偏移后的行。
3. **补全与 hover** —— `pset(` 有签名帮助；`red` 有常量值。
4. **中文存根** —— 中文界面下 hover 返回中文注释。
5. **`os` / `io` 仍然 unknown** —— 确认 `runtime.builtin` 的语义没变。
6. **路径补全** —— `#include ` 后能列出同目录文件。

跑一遍 `yarn e2e` 可以验证调试流程没被影响（两者本来解耦，但便宜）。

---

## 7. 日常排查

### 日志在哪

VS Code 输出面板的 **CLX Language Server** 频道。下载、安装、启动失败都写在这里。

LuaLS 自己的日志在 `globalStorageUri/luals/log/`（由 `LLS_LOG_PATH` 指定）。

### 常见现象

| 现象 | 原因 | 处理 |
|---|---|---|
| 状态栏一直转圈 | 下载中或网络卡住 | 看日志；网络类失败会自动重试一次 |
| 提示"package could not be found" | 清单指向的 release 不存在 | 检查 `res/luals-manifest.json` 的 `release` 与实际 release |
| 提示"failed its integrity check" | 下载字节与 sha256 不符 | 可能是代理；重试或换网络 |
| 没有语言功能但高亮正常 | 下载失败或用户取消 | **这是设计好的降级**，高亮是 TextMate 语法，不依赖服务器 |
| `__gfx__` 段报语法错误 | 插件没生效 | 查 `config.lua` 里 `runtime.plugin` 路径；查日志里有没有插件报错 |
| 断点/补全位置整体偏移 | 插件返回了字符串而不是 diff | 见第 2 节；位置映射没建立 |
| 所有 CLX API 都没有补全 | `workspace.library` 路径错 | 查 `config.lua` 里的绝对路径是否指向 `res/clx-std/<lang>` |

### 手动清缓存

```bash
# macOS
rm -rf ~/Library/Application\ Support/Code/User/globalStorage/lifesmart.clx-language/luals
# Windows
rmdir /s "%APPDATA%\Code\User\globalStorage\lifesmart.clx-language\luals"
```

删掉后下次打开 `.clx` 会重新下载。`.complete` 标记缺失时会自动重下，不需要手工清理
半成品。

### 想确认装的是哪一份

缓存目录名就带着身份：`LuaLS-<platform>-<arch>-<version>-<sha 前8位>`。

---

## 8. 升级时最可能出问题的地方

按风险排序。每一条都是"上游改了就会坏"的假设。

### 8.1 `OnSetText` 接口变了（最高风险）

插件唯一的对外依赖。用到的约定：

- 事件名 `OnSetText`，签名 `OnSetText(uri, text)`
- 返回 diff 表时，每项是 `{ start, finish, text }`，**1-based 字节偏移，闭区间**
- 返回 `nil` 表示不改动
- 由 `script/files.lua` 的 `pluginOnSetText` 调用，然后用
  `script/string-merger.lua:mergeDiff` 合并

**怎么检查**：在 LuaLS 源码里搜 `OnSetText` 和 `mergeDiff`。

```bash
grep -rn "OnSetText" script/
grep -rn "mergeDiff" script/string-merger.lua
```

如果 diff 的字段名或偏移约定变了，`res/luals/clx.lua` 的 `mask()` 要跟着改。
这是唯一的硬耦合点，改动量很小（一个函数）。

### 8.2 `meta/template/` 的结构变了

打包脚本假设 `meta/template/*.lua` 是标准库定义的唯一来源。如果上游把它改名
（比如改成 `meta/src/`），`pack-luals.mjs` 会报
`meta/template/ is empty or missing`。改脚本里的 `KEPT_META` 常量即可。

### 8.3 顶层目录结构变了

打包脚本要求 `bin`、`script`、`locale`、`main.lua` 都存在。缺任何一个都会明确报错。
如果上游加了新目录且运行时需要，补进 `REQUIRED`。

**`locale/` 的教训**：它看起来像可选资源，实际缺了启动即错。删任何顶层目录前先
在本地跑一次。

### 8.4 可执行文件名或位置变了

`executableFor()` 里硬编码了：

```
darwin -> bin/lua-language-server
win32  -> bin/lua-language-server.exe
```

上游如果改名，打包脚本的 `The expected executable is missing` 会指出来。

### 8.5 配置项改名

`lualsConfig.ts` 里用的 `Lua.runtime.version`、`Lua.runtime.plugin`、
`Lua.runtime.builtin`、`Lua.workspace.library`、`Lua.diagnostics.*` 都在
`script/config/template.lua` 里有权威定义。

**怎么检查**：

```bash
grep -n "Lua.runtime.version\|Lua.runtime.plugin\|Lua.runtime.builtin" script/config/template.lua
```

配置项改名不会报错，只会静默失效（表现为某功能没生效），所以升级后要按 6.5 逐项验。

### 8.6 新平台架构

目前清单只有 `darwin-arm64` / `darwin-x64` / `win32-x64`。
如果 LuaLS 开始发 `linux-x64`，或者其他架构，`findBundle` 会明确报
"No LuaLS bundle is available for <platform>/<arch>"，并在消息里列出可选项。

扩展本身只面向 Windows 和 macOS（模拟器没有 Linux 版），所以不需要主动加 Linux。

---

## 9. 存根（res/clx-std、res/clx-lua）

不是 LuaLS 的一部分，但语言功能的正确性依赖它们，所以在这里提一下边界。

- `res/clx-std/{en,zh}` —— CLX 内置 API，按官方文档的章节分文件：

  | 文件 | 内容 |
  |---|---|
  | `graphics.lua` | 画布/颜色/像素/图形/精灵 + `__vm_*` 常量与 16 色调色板 |
  | `text.lua` | `print` / `drawTxt_h` / 光标 / `font_*` / `gb2312_to_utf8` |
  | `map.lua` | `mget` / `mset` / `map` / `tline` |
  | `input.lua` | `btn*` / `inputcfg` / `touch*` |
  | `pad.lua` | `PAD` 常量 + `pad_*`（`usemod('pad')` / `usemod('padmag')`） |
  | `audio.lua` | `sfx` / `music` / `wave` / `micpoll` |
  | `math.lua` | 基础数学、屏幕坐标三角、位运算、随机数 |
  | `table.lua` | `add` / `del` / `deli` / `count` / `all` / `foreach` |
  | `mem.lua` | `peek*` / `poke*` / `memcpy` / `memset` / `reload` |
  | `data.lua` | `cartdata` / `dget` / `dset` / `dflush` |
  | `sys.lua` | `stat` / `statctl` / 时间 / 应用管理 / 服务 / 哈希与压缩 / `__*` 内部函数 |
  | `img.lua` | `img_*`（含空中图流的 `img_airinfo` / `img_loadair` / `img_scrair`） |
  | `anim.lua` | `Anim*` 常量 + `anim_effect` / `anim_calc` |
  | `rlottie.lua` | `rlottie_*`（`usemod('rlottie')`） |
  | `lifecycle.lua` | 11 个生命周期回调（`_init` … `_setstat`） |

- `res/clx-lua/{en,zh}` —— CLX 的 Lua 方言差异：
  - `globals.lua` —— `tostr` / `tonum` / `chr` / `ord` / `split` / `b64*`
  - `loads.lua` —— `load` 改名 `loads`
  - `require.lua` —— `cjson` / `cjson_safe` 及其配置函数

**标准 Lua 5.4 的库不要写进存根** —— 由 LuaLS 自己生成。历史上这里有一批 2018 年
的 Lua 5.1 存根，其中 `os.lua` 和 `io.lua` 在 CLX 里根本不存在，是在教用户调用
不存在的东西，已经删除。

存根文件必须以 `---@meta` 开头，LuaLS 才会把它们当库定义而不是普通源码。

**存根与官方文档同步**：`test/stubs.test.ts` 里固化了官方 API 清单（来自 colox-docs
文档包，平台版本 14），它断言清单里的每个名字都在存根里声明过、并且中英两侧的函数
集合完全一致。官方加新 API 时，把名字加进 `OFFICIAL_API` 再写存根 —— 漏任一步都会
让 `yarn test` 失败。

改存根后不需要重新打包 LuaLS —— 它们是扩展的一部分，随 vsix 发布。
