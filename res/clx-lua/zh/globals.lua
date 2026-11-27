---@meta

--[[
  CLX 的全局函数补充（中文注释版，内容与 ../en/globals.lua 一致）。

  这个文件只放「CLX 的 Lua 运行时与标准 Lua 5.4 不一样」的那部分：
  被覆盖的、被改名的、以及额外的全局函数。标准 Lua 5.4 的 base 库
  （assert / pcall / pairs / select / type / tostring …）由 LuaLS 自带的
  meta/Lua 5.4 提供，这里不要重复声明。

  CLX 使用定制版 Lua 5.4（32 位整数 + 32 位浮点）。
]]


-- ---------------------------------------------------------------------------
-- 转换与字符串工具（全局，与 math.* / string.* 并存）
-- ---------------------------------------------------------------------------

---
--- 值转字符串。v 为字符串时原样返回；布尔转 "true"/"false"；其他类型转 "[类型名]"。
--- v 为数字且 flags 为真时按定点数格式输出：
---   flags&2 非 0 输出 x*0x10000 的十进制整数
---   flags&3==3 输出 32 位十六进制
---   否则输出 "0x高16位.低16位" 定点十六进制
---@param v any
---@param flags boolean
---@return string
function tostr(v, flags) end

---
--- 字符串转数字。解析失败时返回 nil，不报错。
---@param v any
---@return number
function tonum(v) end

---
--- 字节值转单字节字符串（0..255）。
---@param c number
---@return string
function chr(c) end

---
--- 取字符串第 i 个**字节**的值（1-based，默认 1）。i 越界时返回 nil。
---@param s string
---@param i number
---@return number
function ord(s, i) end

---
--- 字符串分割为数组。
--- sep 为字符串时取其首字符作分隔符（默认 ","）；sep 为数字时按固定字节长度切块（≤0 按 1）。
--- convert 默认 true，元素尝试转为数字，转不了的保持字符串。
---@param str string
---@param sep string|number
---@param convert boolean
---@return table
function split(str, sep, convert) end


-- ---------------------------------------------------------------------------
-- Base64（摘要在 res/clx-std/sys.lua 里和其余数据工具一起声明，
-- 它们属于系统 API，不是 Lua 方言差异）
-- ---------------------------------------------------------------------------

---
--- Base64 编码（C 实现，任意二进制串安全）。
---@param data string
---@return string encoded
function b64encode(data) end

---
--- Base64 解码。非法输入返回 nil 加 "EB64"，不抛异常。
---@param data string
---@return string|nil decoded
---@return string|nil error
function b64decode(data) end


-- 另外两条与标准 Lua 的差异不写进存根也能看到：
--   load 改名 loads（见 loads.lua），loadstring 不存在
--   dofile/loadfile 存在但调用即抛错：卡带没有文件系统
--   print 是屏幕绘制（见 res/clx-std/text.lua），控制台日志用 printh
-- 全局 sin/cos/atan2 的参数是一整圈为 1 的屏幕坐标系，不是弧度（见 res/clx-std/math.lua）。

