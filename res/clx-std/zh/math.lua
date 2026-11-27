---@meta

--[[
  CLX 数学、位运算与转换函数。

  这些是与标准 math.* / string.* 并存的全局函数。注意两套三角函数：
  全局 sin/cos/atan2 的参数是一整圈为 1、按屏幕坐标系（y 向下、逆时针），
  而 math.sin/math.cos 用的是弧度。
]]

--[[ 基础 ]]--
--- 返回 X、Y 中较大的值。
---@param X number
---@param Y number
---@return number
function max(X, Y) end

--- 返回 X、Y 中较小的值。
---@param X number
---@param Y number
---@return number
function min(X, Y) end

--- 返回 X、Y、Z 排序后中间的值。常用于限幅：mid(0, x, 100)。
---@param X number
---@param Y number
---@param Z number
---@return number
function mid(X, Y, Z) end

--- 向上取整：不小于 X 的最小整数。
---@param X number
---@return number
function ceil(X) end

--- 向下取整：不大于 X 的最大整数。
---@param X number
---@return number
function flr(X) end

--- 返回 X 的平方根；X < 0 时返回 0。
---@param X number
---@return number
function sqrt(X) end

--- 返回 X 的绝对值。
---@param X number
---@return number
function abs(X) end

--- X < 0 返回 -1，否则返回 1。
---@param X number
---@return number
function sgn(X) end


--[[ 三角函数（屏幕坐标系，一整圈 = 1） ]]--
---
--- 返回 X 的正弦值。X 是角度，0..1 表示一整圈，按屏幕逆时针：
--- 0 向右、0.25 向上、0.5 向左、0.75 向下。
---@param X number
---@return number
function sin(X) end

---
--- 返回 X 的余弦值，角度约定与 sin() 相同。
---@param X number
---@return number
function cos(X) end

---
--- 返回 (DX,DY) 方向的角度，范围 [0,1)，约定同 sin()/cos()。
--- atan2(1, 0) 是 0（向右），atan2(0, -1) 是 0.25（向上），atan2(0, 1) 是 0.75（向下）。
---@param dx number
---@param dy number
---@return number
function atan2(dx, dy) end


--[[ 位运算 ]]--
-- 结果与 Lua 位运算符相同，区别是这些函数在参数非法时静默返回，而运算符会抛异常。

--- 按位与：x & y。
---@param x number
---@param y number
---@return number
function band(x, y) end

--- 按位或：x | y。
---@param x number
---@param y number
---@return number
function bor(x, y) end

--- 按位异或：x ~ y。
---@param x number
---@param y number
---@return number
function bxor(x, y) end

--- 按位取反：~x。
---@param x number
---@return number
function bnot(x) end

--- 左移：x << n，右边补 0。
---@param x number
---@param N number
---@return number
function shl(x, N) end

--- 算术右移：x >> n，左边补符号位。
---@param x number
---@param N number
---@return number
function shr(x, N) end

--- 逻辑右移，左边补 0（没有对应的运算符）。
---@param x number
---@param N number
---@return number
function lshr(x, N) end

--- 循环左移（没有对应的运算符）。
---@param x number
---@param N number
---@return number
function rotl(x, N) end

--- 循环右移（没有对应的运算符）。
---@param x number
---@param N number
---@return number
function rotr(x, N) end


--[[ 随机数 ]]--
---
--- 返回随机数 n，0 <= n < X。不传 X 等价于 rnd(1)；X <= 0 返回 0。
--- 返回值是浮点，需要整数时用 flr(rnd(x))。
--- X 是表时随机返回 table[1] 到 table[#table] 中的一个元素。
---@param X? number|table
---@return number|any
function rnd(X) end

---
--- 设置伪随机数种子。相同的种子会重现相同的随机序列。
---@param X number
function srand(X) end
