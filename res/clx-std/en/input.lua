---@meta

--[[
  CLX input: buttons and touch.

  Gamepads are a separate API (see pad.lua, opened with usemod('pad')). A gamepad held by
  player 0 is also folded into btn()/btnp(), so single-gamepad cartridges keep working.
]]

--[[ buttons ]]--
---
--- Returns the state of button B (0..7). Without B it returns the bitmask of every button.
---@param B? number
---@return boolean|number
function btn(B) end

---
--- Returns true on the frame button B goes from released to pressed.
--- While held it retriggers every INTERVAL frames after DELAY frames; both are configured
--- with btnpcfg. Button 7 (SYS) only fires once.
--- Without B it returns the bitmask of every button, like btn().
---@param B? number
---@return boolean|number
function btnp(B) end

---
--- Configures the btnp auto-repeat. DELAY is the frames before repeating starts, INTERVAL
--- the frames between repeats. btnpcfg(255, 0) disables repeating.
--- Returns the previous DELAY and INTERVAL.
---@param delay number
---@param interval number
---@return number old_delay
---@return number old_interval
function btnpcfg(delay, interval) end


--[[ touch ]]--
---
--- Configures touch and key handling and returns the previous option value.
--- OPT: bit0 = enable touch mode, bit1 = enable touch-simulated buttons.
---@param opt number
---@return number previous_opt
function inputcfg(opt) end

---
--- Queries the touch state.
--- X,Y is the touch position; STAT is 0 once released, in which case X,Y is the last
--- release position. HOTID is the hot-zone id (always 0 on some hosts, prefer RECTIDX),
--- RECTIDX the rectangle index inside the zone, ABORT is reserved and always 0.
---@return number x
---@return number y
---@return number stat
---@return number hotid
---@return number rectidx
---@return number abort
function touch() end

---
--- Defines a touch hot zone, or clears every zone when called without arguments.
--- HOTID is the zone id 1..n; defining the same id again unions the areas, told apart by
--- RECTIDX. FLAG 1 consumes the touch event instead of passing it to the background frame.
--- X0,Y0,X1,Y1 is the rectangle; when X0 is a table the zone is a polygon of 3..8 vertices
--- (6..16 numbers) and the other coordinates are ignored. RECTIDX defaults to 1.
--- Returns the total number of zones.
---@param hotid? number
---@param flag? number
---@param x0? number|table
---@param y0? number
---@param x1? number
---@param y1? number
---@param rectidx? number
---@return number count
function touchdef(hotid, flag, x0, y0, x1, y1, rectidx) end
