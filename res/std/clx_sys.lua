

---
--- 加载一个应用，PARAM_STR 可以在应用启动后通过接口访问。
--- 加载后新应用会替换当前应用。
---@param FILENAME string
---@param NA any
---@param PARAM_STR string
function load(FILENAME, NA, PARAM_STR) end

---
--- 应用从头开始运行。
--- run() 可以从正在运行的程序内部调用以进行重置。
--- 提供 PARAM_STR 时，可以在运行时使用 stat(6) 访问它。
---@param PARAM_STR string
function run(PARAM_STR) end

---
--- 重置运行状态。 这包括调色板、相机位置、剪裁和填充图案。
function reset() end

---
--- 将 参数 打印到主机操作系统的控制台以进行调试。 函数类似lua原始的print。
function printh(...) end

---
--- 返回应用运行以来经过的秒数。
--- 这不是真实世界的时间，而是通过帧数计算出来的逻辑时间。
function time() end

---
--- 0时区，1970年以来的秒数。
function utcsec() end


---
--- 根据格式转换时间, 类似标准的lua的os.date
---@param fmt string
---@param sec number
function utcdate(fmt, sec) end

---
--- 获取 X 所在的系统状态：
--- 0        内存使用，单位kBytes
--- 1        上一帧的cpu占用率
--- 5        平台版本号
--- 6        应用加载时的参数
--- 7        当前帧率
--- 8        设定帧率

--- 30       是否有键盘数据
--- 31       缓存的键盘数据
--- 32       鼠标/触摸的x位置
--- 33       鼠标/触摸的y位置 
--- 34       鼠标/触摸的按键状态

--- 16..19
--- 46..49   当前在通道 0..3 上播放 SFX 的索引
--- 20..23
--- 50..53   通道 0..3 上的音符编号 (0..31)
--- 24/54    当前播放模式索引
--- 25/55    已播放的模式总数
--- 56       当前模式下的播放的tick数

--- 90..96   本地时间 年、月、日、时、分、秒、星期
---@param X number
function stat(X) end

---
--- 根据key设置系统状态，如果没有val，表示只是查询，返回上次的值：
--- altc     替换颜色(32位颜色模式下，填充模版使用的替代颜色)
--- tlmw     tline使用的map的宽度掩码
--- tlmh     tline使用的map的高度掩码
--- tlmx     tline使用的map的x偏移量
--- tlmx     tline使用的map的y偏移量
--- sprm     精灵数据地址映射，0x60表示使用vram地址
--- scrm     屏幕数据地址映射，0x60表示使用vram地址，其他值表示使用精灵数据地址
--- mapw     地图宽度定义，0表示使用规格默认宽度
--- colm     颜色掩码定义，影响4bpp绘图(模拟融合)
---@param key string
---@param val any
function statctl(key, val) end


---
--- 获取应用列表。
function __listcarts() end

---
--- 获取应用参数，如果del为true，会在获取后清空参数。
---@param del boolean
function __getparams(del) end

---
--- 加载bios。
function __loadbioscart() end

---
--- 加载前一个应用(如果有的话)。
function __loadprevcart() end


---
--- 加载系统设置菜单(通用菜单)。
function __loadsettingscart() end


---
--- 加载暂停菜单(如果没有参数，就会根据当前状态做反转)。
---@param pause boolean
function __togglepausemenu(pause) end


---
--- 重新加载应用。
function __resetcart() end


---
--- 读取并返回配置文件的内容。
---@param filename string
function __cfgread(filename) end


---
--- 写配置文件内容，成功返回true。
---@param filename string
---@param str string
function __cfgwrite(filename, str) end


---
--- 删除配置文件。
---@param filename string
function __cfgdel(filename) end

