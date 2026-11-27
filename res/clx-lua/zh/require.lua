---@meta

--[[
  CLX 的 require：卡带没有通用文件系统。

  只有随宿主预载的两个模块可以 require：
    - `cjson`       — JSON 编解码
    - `cjson_safe`  — 返回 nil, err 而不抛异常的 JSON 解码

  require 其他名字会得到 "module not found"。卡带内部的代码复用请用
  `#include` 预处理指令（编译期字节拼接），不要用 require。
]]

--[[ JSON ]]--
---
--- require("cjson") 返回的 JSON 模块。
--- JSON null 的哨兵在 `null` 字段上：Lua 的 nil 无法存入 table，所以解码出的 null
--- 变成这个 lightuserdata。编码前把它塞回去就能输出 null。
---@class cjson
---@field null lightuserdata
local cjson = {}

---
--- 把 Lua 值编码成 JSON 字符串。遇到不支持的类型、超深嵌套或 NaN/Infinity 会抛异常
--- （最后一项可配置）。
---@param value any
---@return string
function cjson.encode(value) end

---
--- 把 JSON 字符串解码成 Lua 值。失败时抛异常；需要 nil, err 请用 cjson_safe。
---@param text string
---@return any
function cjson.decode(text) end

---
--- 创建一个独立配置的模块实例：对它做配置不会影响共享的 cjson 设置。
---@return cjson
function cjson.new() end

---
--- 稀疏数组处理。CONVERT = 0（默认）时小空洞补 null、大空洞按 RATIO/SAFE 转成对象；
--- CONVERT = 1 时稀疏表一律编码为对象。设置时返回旧值，不带参数时返回当前值。
---@param convert? number
---@param ratio? number
---@param safe? number
---@return number
function cjson.encode_sparse_array(convert, ratio, safe) end

---
--- 编码最大嵌套深度（默认 1000），超出报错。返回旧值。
---@param depth? number
---@return number
function cjson.encode_max_depth(depth) end

---
--- 解码最大嵌套深度（默认 1000），超出报错。返回旧值。
---@param depth? number
---@return number
function cjson.decode_max_depth(depth) end

---
--- 浮点编码的有效数字位数，1..14（默认 14）。平台浮点是 32 位，超过 7 位没有实际收益。
---@param precision? number
---@return number
function cjson.encode_number_precision(precision) end

---
--- 复用内部编码缓冲区（默认 true）。省内存时关掉。
---@param enabled? boolean
---@return boolean
function cjson.encode_keep_buffer(enabled) end

---
--- NaN/Infinity 的编码策略："off" 报错（默认）、"on" 输出字面量、"null" 输出 null。
---@param mode? "off"|"on"|"null"
---@return string
function cjson.encode_invalid_numbers(mode) end

---
--- 解码时是否接受 NaN/Infinity 字面量（默认 true，即不是严格 JSON）。
---@param enabled? boolean
---@return boolean
function cjson.decode_invalid_numbers(enabled) end

---@class cjson_safe
local cjson_safe = {}

---
--- 把 JSON 字符串解码成 Lua 值。失败时返回 nil 加错误信息，不抛异常 ——
--- 处理网络响应这类不可信输入时用它。
---@param text string
---@return any
---@return string|nil error
function cjson_safe.decode(text) end

---
--- 预载模块名。CLX 只认这两个。
---@param modname "cjson"|"cjson_safe"
---@return cjson|cjson_safe
function require(modname) end
