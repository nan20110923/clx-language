---@meta

--[[
  CLX math, bit operations and conversion helpers.

  These are global functions that live alongside the standard math.* / string.* libraries.
  Note the two trigonometric systems: the globals sin/cos/atan2 take a turn in [0,1) and
  follow the screen axes (y down, counterclockwise), while math.sin/math.cos take radians.
]]

--[[ basic ]]--
--- Returns the larger of X and Y.
---@param X number
---@param Y number
---@return number
function max(X, Y) end

--- Returns the smaller of X and Y.
---@param X number
---@param Y number
---@return number
function min(X, Y) end

--- Returns the middle value of X, Y and Z. Handy for clamping: mid(0, x, 100).
---@param X number
---@param Y number
---@param Z number
---@return number
function mid(X, Y, Z) end

--- Rounds up: the smallest integer >= X.
---@param X number
---@return number
function ceil(X) end

--- Rounds down: the largest integer <= X.
---@param X number
---@return number
function flr(X) end

--- Returns the square root of X, or 0 when X < 0.
---@param X number
---@return number
function sqrt(X) end

--- Returns the absolute value of X.
---@param X number
---@return number
function abs(X) end

--- Returns -1 for X < 0 and 1 otherwise.
---@param X number
---@return number
function sgn(X) end


--[[ trigonometry (screen axes, one turn = 1) ]]--
---
--- Returns the sine of X. X is the angle where 0..1 is a full turn, counterclockwise on
--- screen, so 0 is right, 0.25 is up, 0.5 is left and 0.75 is down.
---@param X number
---@return number
function sin(X) end

---
--- Returns the cosine of X, with the same angle convention as sin().
---@param X number
---@return number
function cos(X) end

---
--- Returns the angle in [0,1) pointing along (DX,DY), with the same convention as sin()/cos().
--- atan2(1, 0) is 0 (right), atan2(0, -1) is 0.25 (up), atan2(0, 1) is 0.75 (down).
---@param dx number
---@param dy number
---@return number
function atan2(dx, dy) end


--[[ bit operations ]]--
-- Same results as the Lua bitwise operators, except these functions return silently for
-- invalid arguments where the operators raise.

--- Bitwise and: x & y.
---@param x number
---@param y number
---@return number
function band(x, y) end

--- Bitwise or: x | y.
---@param x number
---@param y number
---@return number
function bor(x, y) end

--- Bitwise exclusive or: x ~ y.
---@param x number
---@param y number
---@return number
function bxor(x, y) end

--- Bitwise not: ~x.
---@param x number
---@return number
function bnot(x) end

--- Shift left: x << n, filling with zeros.
---@param x number
---@param N number
---@return number
function shl(x, N) end

--- Arithmetic shift right: x >> n, filling with the sign bit.
---@param x number
---@param N number
---@return number
function shr(x, N) end

--- Logical shift right, filling with zeros (no operator equivalent).
---@param x number
---@param N number
---@return number
function lshr(x, N) end

--- Rotate left (no operator equivalent).
---@param x number
---@param N number
---@return number
function rotl(x, N) end

--- Rotate right (no operator equivalent).
---@param x number
---@param N number
---@return number
function rotr(x, N) end


--[[ random ]]--
---
--- Returns a random number n with 0 <= n < X. Without X it behaves like rnd(1); X <= 0
--- returns 0. The result is a float, so use flr(rnd(x)) for integers.
--- When X is a table it returns a random element from table[1] to table[#table].
---@param X? number|table
---@return number|any
function rnd(X) end

---
--- Seeds the pseudo-random generator. The same seed reproduces the same sequence.
---@param X number
function srand(X) end
