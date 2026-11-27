---@meta

--[[
  CLX 输入：按键与触摸。

  手柄是独立的一套 API（见 pad.lua，usemod('pad') 打开）。玩家 0 的手柄按键也会并进
  btn()/btnp()，所以只接一只手柄的卡带不用改。
]]

--[[ 按键 ]]--
---
--- 返回按键 B（0..7）的状态。不传 B 时返回所有按键的位掩码。
---@param B? number
---@return boolean|number
function btn(B) end

---
--- 按键 B 从释放变为按下的那一帧返回 true。
--- 持续按住时，延迟 DELAY 帧后每 INTERVAL 帧再触发一次，两者由 btnpcfg 配置。
--- 按键 7（SYS）只触发一次。不传 B 时返回所有按键的位掩码，与 btn() 相同。
---@param B? number
---@return boolean|number
function btnp(B) end

---
--- 配置 btnp 的连击。DELAY 是开始连击前的延迟帧数，INTERVAL 是连击间隔帧数。
--- btnpcfg(255, 0) 禁用连击。返回旧的 DELAY 与 INTERVAL。
---@param delay number
---@param interval number
---@return number old_delay
---@return number old_interval
function btnpcfg(delay, interval) end


--[[ 触摸 ]]--
---
--- 配置触摸与按键功能，返回上一次的配置值。
--- OPT：bit0 使能触摸模式，bit1 使能触摸模拟按键模式。
---@param opt number
---@return number previous_opt
function inputcfg(opt) end

---
--- 查询触摸状态。
--- X,Y 是触摸位置；STAT 释放后为 0，此时 X,Y 是上一次释放的位置。
--- HOTID 是所在热区编号（部分宿主下恒为 0，优先用 RECTIDX），
--- RECTIDX 是热区内的矩形编号，ABORT 是保留位、恒为 0。
---@return number x
---@return number y
---@return number stat
---@return number hotid
---@return number rectidx
---@return number abort
function touch() end

---
--- 定义一个触摸热区；不带参数调用清除所有热区。
--- HOTID 是热区编号 1..n，重复定义同一编号相当于联合区域，用 RECTIDX 区分子区域。
--- FLAG 为 1 表示消耗触摸事件、不传递给后台框架。
--- X0,Y0,X1,Y1 是热区矩形；X0 为表时改为多边形热区（3..8 个顶点，即 6..16 个数），
--- 其余坐标被忽略。RECTIDX 默认 1。返回热区总数。
---@param hotid? number
---@param flag? number
---@param x0? number|table
---@param y0? number
---@param x1? number
---@param y1? number
---@param rectidx? number
---@return number count
function touchdef(hotid, flag, x0, y0, x1, y1, rectidx) end
