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
--- Button constants registered together with usemod('pad'). The values are opaque:
--- always use the names, never the numbers.
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
--- Returns the bitmask of buttons currently held by player P (default 0).
--- Combine with the PAD constants, e.g. `pad_state(1) & PAD.A ~= 0`.
---@param p? number
---@return number bitmask
function pad_state(p) end

---
--- True when button ID (a PAD constant) is held by player P (default 0).
--- Only level is exposed: there is no "just pressed" variant, track the previous frame yourself.
---@param id number
---@param p? number
---@return boolean pressed
function pad_btn(id, p) end

---
--- Returns the left and right stick axes of player P (default 0).
--- 0 means centered; an absent gamepad or one without sticks returns all zeros.
--- The value range is not finalized, so use the sign and relative magnitude rather than
--- hard-coded thresholds.
---@param p? number
---@return number lx
---@return number ly
---@return number rx
---@return number ry
function pad_stick(p) end

---
--- True when player P's slot (default 0) has a gamepad this frame.
--- Gamepads fill the lowest empty slot, so a single gamepad is always player 0.
---@param p? number
---@return boolean connected
function pad_conn(p) end

---
--- Controls whether gamepads are folded into btn()/btnp() as system buttons.
--- Without ON it only reads the current value. Defaults to true, and the setting persists
--- across cartridges. Turn it off to read the gamepad exclusively through pad_*().
---@param on? boolean
---@return boolean current
function pad_assys(on) end


--[[ 管理：usemod('padmag') ]]--
-- 全部函数立即返回，扫描和连接在后台异步进行，用查询函数轮询进度。
-- pad_connect / pad_unpair 的下标从 0 开始，和 ipairs 的 1 起不同。
---
--- Starts a background scan and returns immediately. SEC is 1..60 seconds (default 8).
--- true means the request was accepted, not that it finished. false means it was rejected:
--- the Bluetooth stack is down, or a scan/connect is already running.
--- Scanning never connects anything by itself: it only refills the pad_found() list.
---@param sec? number
---@return boolean accepted
function pad_scan(sec) end

---
--- Aborts the current scan. Devices found so far stay in the list.
function pad_scanstop() end

---
--- Scan state: 0 = idle (never scanned, request pending, or unsupported),
--- 1 = scanning, 2 = finished.
---@return number state
function pad_scanstate() end

---
--- Devices from the last scan, newest first, at most 8 entries. Each entry holds
--- {name =, addr =, rssi =}. The list is not filtered: speakers and headsets show up too.
---@return table|{name: string, addr: string, rssi: number}[]
function pad_found() end

---
--- Connects entry IDX (0-based) of the scan list to player P (default 0).
--- true means the connection started in the background; poll pad_conn()/pad_status().
--- An existing gamepad in that slot is displaced. Success also stores the pairing.
---@param idx number
---@param p? number
---@return boolean accepted
function pad_connect(idx, p) end

---
--- Disconnects player P's gamepad (default 0). Also asynchronous: poll pad_conn().
--- false when that slot has no gamepad. The pairing record is kept, so the gamepad
--- reconnects on the next key press.
---@param p? number
---@return boolean accepted
function pad_disconnect(p) end

---
--- The paired list (auto-reconnect on boot), same shape as pad_found(), at most 8 entries.
--- rssi is always 0 here and carries no meaning.
---@return table|{name: string, addr: string, rssi: number}[]
function pad_bonds() end

---
--- False when player P's slot (default 0) has no gamepad; otherwise the gamepad info
--- {name =, addr =, rssi =} (rssi is meaningless here).
---@param p? number
---@return table|nil
function pad_info(p) end

---
--- Deletes pairing record IDX (0-based). Only the record is removed: a currently
--- connected gamepad keeps working until it reconnects. false when IDX is out of range.
---@param idx number
---@return boolean removed
function pad_unpair(idx) end

---
--- Clears every pairing record. Currently connected gamepads stay connected.
function pad_forget() end

---
--- Gamepad bus state: "Off", "Idle", "Scanning", "Connecting", "Connected".
--- Empty string on devices without gamepad support.
---@return string state
function pad_status() end

---
--- Reason for the last failed management operation (empty string when none ever failed).
--- Successful operations do not clear it.
---@return string message
function pad_lasterr() end

---
--- Hands control back to the automatic flow (scan, pick, pair and connect unattended).
--- Manual mode started by pad_connect() stops applying. true = accepted.
---@return boolean accepted
function pad_auto() end
