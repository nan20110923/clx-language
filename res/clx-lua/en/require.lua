---@meta

--[[
  CLX require: cartridges have no general filesystem.

  Only the two modules preloaded by the host can be required:
    - `cjson`       — JSON encode/decode
    - `cjson_safe`  — JSON decode that returns nil, err instead of raising

  Any other name raises "module not found". Reuse code inside a cartridge with the
  `#include` preprocessor directive (spliced at build time), not with require.
]]

--[[ JSON ]]--
---
--- JSON module returned by require("cjson").
--- The sentinel for JSON null lives in the `null` field: Lua nil cannot live in a table, so
--- decoded nulls become that lightuserdata. Assign it back before encoding to get null out.
---@class cjson
---@field null lightuserdata
local cjson = {}

---
--- Encodes a Lua value as JSON. Raises on unsupported types, excessive depth or NaN/Infinity
--- (the last one is configurable).
---@param value any
---@return string
function cjson.encode(value) end

---
--- Decodes a JSON string into a Lua value. Raises on failure; use cjson_safe for nil, err.
---@param text string
---@return any
function cjson.decode(text) end

---
--- Creates an independent module instance: configuring it does not affect the shared
--- cjson settings.
---@return cjson
function cjson.new() end

---
--- Sparse array handling. CONVERT = 0 (default) pads small holes with null and turns larger
--- ones into an object using RATIO/SAFE; CONVERT = 1 always encodes sparse tables as objects.
--- Returns the previous values when setting, the current ones when called without arguments.
---@param convert? number
---@param ratio? number
---@param safe? number
---@return number
function cjson.encode_sparse_array(convert, ratio, safe) end

---
--- Encoder nesting limit (default 1000); deeper values raise. Returns the old value.
---@param depth? number
---@return number
function cjson.encode_max_depth(depth) end

---
--- Decoder nesting limit (default 1000); deeper input raises. Returns the old value.
---@param depth? number
---@return number
function cjson.decode_max_depth(depth) end

---
--- Significant digits used when encoding floats, 1..14 (default 14). The platform float is
--- 32-bit, so anything past 7 buys nothing.
---@param precision? number
---@return number
function cjson.encode_number_precision(precision) end

---
--- Reuse the internal encode buffer (default true). Turn it off to save memory.
---@param enabled? boolean
---@return boolean
function cjson.encode_keep_buffer(enabled) end

---
--- NaN/Infinity encoding: "off" raises (default), "on" emits the bare literals,
--- "null" emits null.
---@param mode? "off"|"on"|"null"
---@return string
function cjson.encode_invalid_numbers(mode) end

---
--- Accept NaN/Infinity literals when decoding (default true, i.e. not strict JSON).
---@param enabled? boolean
---@return boolean
function cjson.decode_invalid_numbers(enabled) end

---@class cjson_safe
local cjson_safe = {}

---
--- Decodes a JSON string into a Lua value. Failure returns nil plus an error message instead
--- of raising — the right choice for untrusted input such as network responses.
---@param text string
---@return any
---@return string|nil error
function cjson_safe.decode(text) end

--
--- The preloaded module names. CLX knows only these two.
---@param modname "cjson"|"cjson_safe"
---@return cjson|cjson_safe
function require(modname) end
