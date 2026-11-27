---@meta

--[[
  CLX 手柄输入（pad）。

  usemod('pad') 注册状态读取 API（pad_state / pad_btn / pad_stick / pad_conn /
  pad_assys）与 PAD 常量表；usemod('padmag') 注册管理 API（扫描、配对、连接）。
  两个模块各自独立，设备不支持手柄时返回假值，那些全局名字根本不会出现，
  所以务必先判断返回值。

  读取函数在玩家编号越界或该槽没有手柄时返回 false / 0 / 全 0，不会报错。
]]

---
--- 按键常量，随 usemod('pad') 注册。数值是不透明的：只用名字，不要用数字。
---@class PAD
---@field A number
---@field B number
---@field X number
---@field Y number
---@field L number
---@field R number
---@field L2 number
---@field R2 number
---@field L3 number
---@field R3 number
---@field MENU number
---@field UP number
---@field DOWN number
---@field LEFT number
---@field RIGHT number
---@field START number
---@field SELECT number
PAD = {}


--[[ 状态读取：usemod('pad') ]]--
---
--- 返回玩家 P（默认 0）当前按下的按键位掩码。配合 PAD 常量做位运算，
--- 例如 pad_state(1) & PAD.A ~= 0。
---@param p? number
---@return number bitmask
function pad_state(p) end

---
--- 玩家 P（默认 0）的按键 ID（PAD 常量）是否按下。
--- 只提供电平：没有「刚按下」的版本，需要边沿请自己记住上一帧。
---@param id number
---@param p? number
---@return boolean pressed
function pad_btn(id, p) end

---
--- 返回玩家 P（默认 0）左右摇杆的轴值。0 表示居中；没接手柄或该手柄没有摇杆时全返回 0。
--- 取值范围尚未最终确定，建议按符号与相对大小使用，不要写死阈值。
---@param p? number
---@return number lx
---@return number ly
---@return number rx
---@return number ry
function pad_stick(p) end

---
--- 玩家 P（默认 0）的槽位这一帧是否有手柄。
--- 手柄填最低的空槽，所以只接一只手柄时它一定是玩家 0。
---@param p? number
---@return boolean connected
function pad_conn(p) end

---
--- 控制手柄是否作为系统按键并进 btn()/btnp()。不带 ON 时只读取当前值。
--- 默认 true，且这个设置会跨卡带保留。关掉后可以只用 pad_*() 读手柄。
---@param on? boolean
---@return boolean current
function pad_assys(on) end


--[[ 管理：usemod('padmag') ]]--
-- 全部函数立即返回，扫描和连接在后台异步进行，用查询函数轮询进度。
-- pad_connect / pad_unpair 的下标从 0 开始，和 ipairs 的 1 起不同。
---
--- 发起一次后台扫描并立即返回。SEC 为 1..60 秒（默认 8）。
--- true 只表示请求已受理，不代表扫完；false 表示被拒 —— 蓝牙栈没起来，或正在扫描/连接。
--- 扫描本身不连接任何设备，只重新填充 pad_found() 列表。
---@param sec? number
---@return boolean accepted
function pad_scan(sec) end

---
--- 中止当前扫描。已扫到的结果保留。
function pad_scanstop() end

---
--- 扫描状态：0 = 空闲（从没扫过 / 请求刚提交 / 不支持），1 = 扫描中，2 = 已完成。
---@return number state
function pad_scanstate() end

---
--- 最近一次扫描的设备，新的在前，最多 8 条。每项为 {name=, addr=, rssi=}。
--- 列表不做过滤：音箱、耳机也会出现。
---@return table|{name: string, addr: string, rssi: number}[]
function pad_found() end

---
--- 把扫描列表第 IDX 项（0 起）连到玩家 P（默认 0）。
--- true 表示已在后台开始连接，过几帧用 pad_conn()/pad_status() 看结果。
--- 目标槽已有手柄时会被顶掉；连接成功后自动记入配对列表。
---@param idx number
---@param p? number
---@return boolean accepted
function pad_connect(idx, p) end

---
--- 断开玩家 P（默认 0）的手柄。同样是异步的：轮询 pad_conn()。
--- 该槽本来没手柄时返回 false。只断连接、保留配对记录，所以手柄再按个键会连回来。
---@param p? number
---@return boolean accepted
function pad_disconnect(p) end

---
--- 已配对（开机自动回连）的列表，结构与 pad_found() 相同，最多 8 条。
--- 这里 rssi 恒为 0，没有意义。
---@return table|{name: string, addr: string, rssi: number}[]
function pad_bonds() end

---
--- 玩家 P（默认 0）当前连着手柄时返回 {name=, addr=, rssi=}（这里 rssi 无意义），
--- 没连返回 nil。
---@param p? number
---@return table|nil
function pad_info(p) end

---
--- 删除配对列表第 IDX 条（0 起）。只删记录：已连着的手柄继续可用，效果在下次重连/开机时体现。
--- IDX 越界返回 false。
---@param idx number
---@return boolean removed
function pad_unpair(idx) end

---
--- 清空全部配对记录。当前已连接的手柄不受影响。
function pad_forget() end

---
--- 手柄总线状态："Off"、"Idle"、"Scanning"、"Connecting"、"Connected"。
--- 设备不支持手柄时返回空串。
---@return string state
function pad_status() end

---
--- 上一次管理操作失败的原因（空串 = 还没失败过）。成功的操作不会清空它。
---@return string message
function pad_lasterr() end

---
--- 交还自动流程（无人值守地扫描、挑选、配对并连接）。pad_connect() 开启的手动模式就此失效。
--- true = 已受理。
---@return boolean accepted
function pad_auto() end
