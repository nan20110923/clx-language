---@meta

--[[
  CLX global functions that differ from standard Lua 5.4.

  Only the parts where the CLX runtime diverges from stock Lua live here: overridden,
  renamed and extra globals. The standard base library (assert / pcall / pairs / select /
  type / tostring …) comes from LuaLS's own meta/Lua 5.4 — do not redeclare it.

  CLX runs a customized Lua 5.4 with 32-bit integers and 32-bit floats.
]]


-- ---------------------------------------------------------------------------
-- Conversion and string helpers (globals, alongside math.* / string.*)
-- ---------------------------------------------------------------------------

---
--- Converts a value to a string. Strings pass through, booleans become "true"/"false" and
--- other types become "[typename]".
--- For numbers with FLAGS set it switches to fixed-point output:
---   FLAGS & 2 != 0     x * 0x10000 as a decimal integer
---   FLAGS & 3 == 3    32-bit hexadecimal
---   otherwise         "0x<high16>.<low16>" fixed-point hex
---@param v any
---@param flags? boolean|number
---@return string
function tostr(v, flags) end

---
--- Converts a string to a number. Returns nil instead of raising when parsing fails.
---@param v any
---@return number|nil
function tonum(v) end

---
--- Returns the single-byte string for byte value C (0..255).
---@param c number
---@return string
function chr(c) end

---
--- Returns the byte value at position I (1-based, default 1) of S, or nil when I is out of
--- range.
---@param s string
---@param i? number
---@return number|nil
function ord(s, i) end

---
--- Splits a string into an array.
--- A string SEP uses its first character as the separator (default ","); a number SEP cuts
--- fixed-size chunks (<= 0 behaves like 1).
--- CONVERT defaults to true: elements are turned into numbers when possible, otherwise they
--- stay strings.
---@param str string
---@param sep? string|number
---@param convert? boolean
---@return table
function split(str, sep, convert) end


-- ---------------------------------------------------------------------------
-- Base64 (the digests, compress and decompress are declared next to the other data tools
-- in res/clx-std/sys.lua — they belong to the system API, not to the Lua dialect)
-- ---------------------------------------------------------------------------

---
--- Base64-encodes DATA. Binary safe (a C implementation).
---@param data string
---@return string encoded
function b64encode(data) end

---
--- Base64-decodes DATA. Invalid input returns nil plus "EB64" instead of raising.
---@param data string
---@return string|nil decoded
---@return string|nil error
function b64decode(data) end


-- Note: the global sin/cos/atan2 take a turn in [0,1) along the screen axes, not radians;
-- they are declared in res/clx-std/math.lua. math.sin/math.cos take radians.
