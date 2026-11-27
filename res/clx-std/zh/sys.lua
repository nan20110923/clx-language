---@meta

--[[
  CLX 系统 API（对应官方文档 system.md）。

  stat / statctl 的状态码与 key 完整保留 —— 它们是用户唯一能查到
  「90..96 是本地时间」这类规则的地方。
]]


--[[ 系统状态 ]]--
---
--- 获取系统状态 X。未列出的索引返回 0。
---   0  内存使用（KB）
---   1  上一帧的 CPU 占用率（0~1）
---   2  CPU 占用占位值（当前恒 0.5）
---   4  剪贴板内容（当前恒空串）
---   5  平台版本号（当前 14）
---   6  load() 传入的参数串（桌面构建可用 `-a` 指定）
---   7  当前帧率
---   8  设定帧率
---   12 开机至今的毫秒数
---   30 是否有键盘数据（布尔）
---   31 缓存的键盘数据
---   32 鼠标/触摸的 X
---   33 鼠标/触摸的 Y
---   34 鼠标/触摸的按键状态
---   16..19 / 46..49  通道 0..3 上播放的 SFX 索引
---   20..23 / 50..53  通道 0..3 上的音符编号（0..31）
---   24 / 54  当前播放模式索引
---   25 / 55  已播放的模式总数
---   26 / 56  当前模式下的播放 tick 数
---   89 整机已运行秒数（整数与小数两个返回值）
---   90..96  本地时间：年、月、日、时、分、秒、星期（1 = 星期日）
---   97 上一帧耗时（秒）
---   100 load() 第 2 参传入的面包屑串
---   108 恒 32
---   9..11  仅 ESP32S3 固件：free heap / littlefs / TF 卡信息（各三个返回值）
---@param X number
---@return number|string|boolean value
function stat(X) end

---
--- 设置或查询系统状态。不传 VAL 只读取并返回当前值；传 VAL 则应用并返回旧值。
---   altc  替换颜色（32bpp 下填充模板使用的替代颜色）
---   tlmw / tlmh  tline 使用的 map 宽/高掩码
---   tlmx / tlmy  tline 使用的 map 偏移
---   sprm  精灵数据地址映射（0x60 = 使用 VRAM 地址）
---   scrm  屏幕数据地址映射（0 = 精灵表，其他 = VRAM）
---   mapw  地图宽度（0 = 规格默认），同时影响 map()/mget()/mset()
---   colm  颜色掩码：4bpp 低 4 位写掩码 + 高 4 位读掩码，8bpp 为 16 位组合值
---         （低字节写、高字节读，默认 0xffff），16bpp 下作 alpha 混合参数
---   nedf  圆屏显示标志（仅圆屏固件 + 128 宽 4bpp）：bit0 = 保证画面不被圆形裁剪，
---         bit1 = 保持比例，bit2 = 禁止缩放
---   dfps  全局 FPS/CPU 调试叠加层：真值开、false 或 0 关、省略为查询
---         （默认关，跨 cartridge 切换保持生效）
--- Opus 编解码器 key（仅启用 Opus 的固件可用），统一三态约定
--- 「省略 = 查询，val >= 0 = 设置，val == -1 = 恢复默认」：
---   oers / odrs  采样率 8000/12000/16000/24000/48000（默认 16000）
---   oedm / oddm  帧时长 5/10/20/40/60 毫秒（默认 60）
---   oebt  比特率，0 = 自动（默认 0）
---   oecp  复杂度 0..10（默认 6）
---   oeap  应用类型 0 = VOIP、1 = AUDIO、2 = LOWDELAY（默认 0）
---   orst  销毁编解码器，下次使用按当前配置重建：省略或 -1 = 全部，0 = 编码器，1 = 解码器
--- 编码器 key 以 `oe` 开头、解码器以 `od` 开头；两侧的采样率与帧时长必须一致才能互通。
---@param key string
---@param val? any
---@return any previous_value
function statctl(key, val) end


--[[ 时间 ]]--
---
--- 返回应用运行以来经过的秒数，由帧数计算得出（逻辑时间，不是真实世界时间）。
---@return number
function time() end

---
--- 同 time()：应用运行以来经过的秒数。
---@return number
function t() end

---
--- 返回 UTC 时区自 1970 年以来的秒数。（不建议使用）
---@return number
function utcsec() end

---
--- 按格式字符串转换时间，类似标准 Lua 的 os.date。FMT 默认 "%c"；
--- 以 `!` 开头强制按 UTC 输出，传 "*t" 返回含 year/month/day/hour/min/sec/wday/yday/isdst
--- 的时间表。SEC 是 Unix 时间戳，默认当前时间。
--- （不建议使用：优先用 stat(90..96)。）
---@param fmt? string
---@param sec? number
---@return string|table
function utcdate(fmt, sec) end


--[[ 应用管理 ]]--
---
--- 加载并切换到另一个应用。NA 是面包屑，新卡带经 stat(100) 读回；
--- PARAM_STR 传给新应用，可通过 stat(6) 访问。
---@param FILENAME string
---@param NA? string
---@param PARAM_STR? string
function load(FILENAME, NA, PARAM_STR) end

---
--- 从头重新运行当前应用。不接受参数。
function run() end

---
--- 重置运行状态：调色板、摄像机位置、裁剪区域与填充图案恢复默认。
function reset() end

-- reload(dest, source, len [, filename]) 从应用文件重新加载数据到内存，
-- 声明在 mem.lua 里，参数表也在那里。


--[[ 后台服务 ]]--
---
--- 获取点分隔路径 PATH（如 "wifi.sta.ip"）上的服务数据。
--- 命中时最多返回三个值：数据、版本号 VID、TTL。
--- FILTERVID 传一个已知版本号：数据未变化时返回 nil 加该 VID，可用于变化检测。
---@param path string
---@param filtervid? number
---@return any data
---@return number vid
---@return number ttl
function svcget(path, filtervid) end

---
--- 在根键 KEY 下添加服务数据（整体替换该根变量，没有路径语义）。
--- VID 是可选版本号（默认 0）。以 `$` 开头的系统服务名不可写。成功返回 true。
---@param key string
---@param vid? number
---@param data any
---@return boolean ok
function svcadd(key, vid, data) end

---
--- 在先导路径 PATH 下把字段 NAME 设为 DATA。以 `$` 开头的路径不可写。成功返回 true。
---@param path string
---@param name string
---@param data any
---@return boolean ok
function svcset(path, name, data) end

---
--- 向服务发起请求，例如 svcreq("http", "myservice.data")。
---@param type string
---@param name_path string
function svcreq(type, name_path) end

---
--- 订阅 PATH 的服务数据变更通知（空串 = 该服务的全部事件）。同一 NAME 可注册多个路径。
--- 通知通过全局回调 _svcind(seq, name, path) 送达。成功返回 true。
---@param name string
---@param path string
---@return boolean ok
function svcmon(name, path) end


--[[ 前台/后台 ]]--
---
--- 把当前应用切到 idle（后台）。ARG 会透传给 BIOS 的 idle 处理。
---@param arg? any
function toidle(arg) end

---
--- 请求把应用切到前台（激活状态）。成功返回 true。PRI 与 FORCE 透传给 BIOS。
---@param pri? number
---@param force? boolean
---@return boolean ok
function tofg(pri, force) end


--[[ 数据工具 ]]--
---
--- 用 zlib 压缩 DATA 的 1 基区间 FROM..TO（默认全部），LEVEL 为 0..9。
--- 其余参数是 zlib 高级选项（method、windowBits、memLevel、strategy、dict）。
--- 返回压缩串与 zlib 返回码。
---@param data string
---@param from? number
---@param to? number
---@param level? number
---@param ... any
---@return string compressed
---@return number zlib_code
function compress(data, from, to, level, ...) end

---
--- 用 zlib 解压 DATA 的 1 基区间 FROM..TO。支持 raw 流（负 windowBits）与字典。
---@param data string
---@param from? number
---@param to? number
---@param ... any
---@return string decompressed
function decompress(data, from, to, ...) end

---
--- 返回 DATA 的 MD5，16 字节原始数据。
---@param data string
---@return string digest
function md5sum(data) end

---
--- 返回 DATA 的 MD5，32 字符小写十六进制。
---@param data string
---@return string hex
function md5sumhexa(data) end

---
--- 返回 DATA 的 SHA-1，20 字节原始数据。
---@param data string
---@return string digest
function sha1sum(data) end

---
--- 返回 DATA 的 SHA-1，40 字符小写十六进制。
---@param data string
---@return string hex
function sha1sumhexa(data) end

---
--- 把参数打印到主机操作系统的控制台，类似标准 print，用于调试。
--- 屏幕上的版本是 print（见 text.lua），日志请用 printh。
---@param ... any
function printh(...) end


--[[ 模块 ]]--
---
--- 加载可选模块：'mic'、'net'、'vg'、'sim'、'pad'、'padmag'、'b2d'
--- （具体可用取决于固件编入了哪些）。成功返回 true。
--- anim、img 与 cjson 不需要 usemod：anim 和 img 常驻，cjson 走 require()。
---@param modname string
---@return boolean ok
function usemod(modname) end


--[[ 内部函数：应用管理 ]]--
--- 获取应用列表。
function __listcarts() end

---
--- 获取应用参数。DEL = true 时取完即清空。
---@param del? boolean
---@return string|nil
function __getparams(del) end

--- 加载 BIOS。
function __loadbioscart() end

--- 加载前一个应用（如果有的话）。
function __loadprevcart() end

--- 加载系统设置菜单。
function __loadsettingscart() end

---
--- 切换暂停菜单。不带 PAUSE 时按当前状态取反。
---@param pause? boolean
function __togglepausemenu(pause) end

--- 重新加载当前应用。
function __resetcart() end


--[[ 内部函数：配置文件 ]]--
---
--- 读取配置文件内容。
---@param filename string
---@return string|nil
function __cfgread(filename) end

---
--- 写入配置文件，成功返回 true。
---@param filename string
---@param str string
---@return boolean ok
function __cfgwrite(filename, str) end

---
--- 删除配置文件。
---@param filename string
---@return boolean ok
function __cfgdel(filename) end


--[[ 内部函数：资源 ]]--
---
--- 获取 CARTNAME 的 cartridge 信息：size、filename、specid、ver、style、name、author、desc 等。
---@param cartname? string
---@return table info
function __cartinfo(cartname) end

---
--- 读取资源文件。`name` 传 'size' 只取长度，传 'fullpath' 切换为完整路径模式。
--- FROM..TO 选择字节区间。
---@param name string
---@param from? number
---@param to? number
---@return string|nil data
function __resread(name, from, to) end

---
--- 列出资源文件。PATTERN 支持 '|' 分隔的多个模式与 '*' / '?' 通配
--- （无通配符即精确文件名；空串或 nil 不过滤）。SUBDIR 相对卡带目录
--- （以 '/' 开头为完整路径特权模式）。TYPE 为 'dir' 或 'all' 时也列出目录；
--- DETAIL = true 才对每个文件 stat 取 size。
--- 返回记录数组 {name=, path=, type="file"|"dir", size=}，path 可直接传给 __resread。
---@param pattern? string
---@param subdir? string
---@param type? "file"|"dir"|"all"
---@param detail? boolean
---@return table|{name: string, path: string, type: string, size: number}[]
function __reslist(pattern, subdir, type, detail) end

---
--- 获取最近一次加载错误的信息。
---@return string message
function __getbioserror() end
