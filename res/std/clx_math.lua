---
--- Returns the larger of X,Y.
---@param X number
---@param Y number
function max(X, Y) end


---
--- Returns the smaller of X,Y.
---@param X number
---@param Y number
function min(X, Y) end

---
--- Returns the middle value of X,Y,Z.
---@param X number
---@param Y number
---@param Z number
function mid(X, Y, Z) end

---
--- Ceil
---@param X number
function ceil(X) end

---
--- Floor
---@param X number
function flr(X) end

---
--- Returns the sine of x.
--- Note: Unlike math.sin/math.cos, here y is reversed depending on the direction of the screen coordinates.
--- x is the angle, which corresponds to the counterclockwise direction on the screen, and the whole circle corresponds to 0..1.
--- For example, the rightmost (0 degrees) is 0, and the leftmost (180 degrees) is 0.5.
---@param X number
function sin(X) end


---
--- Returns the cosine of x.
--- Note: Unlike math.sin/math.cos, here y is reversed depending on the direction of the screen coordinates.
--- x is the angle, which corresponds to the counterclockwise direction on the screen, and the whole circle corresponds to 0..1.
--- For example, the rightmost (0 degrees) is 0, and the leftmost (180 degrees) is 0.5.
---@param X number
function cos(X) end

---
--- Converts to an angle (0..1) based on dx,dy.
--- The angle corresponds to the counterclockwise direction of the screen.
---@param dx number
---@param dy number
function atan2(dx, dy) end

---
--- Sqrt x and returns 0 if x < 0.
---@param x number
function sqrt(x) end


---
--- Returns the absolute value of x.
---@param x number
function abs(x) end

---
--- Returns positive or negative. x<0 returns -1, x>=0 returns 1.
---@param x number
function sgn(x) end

---
--- Bit and
---@param x number
---@param y number
function band(x, y) end

---
--- Bit or
---@param x number
---@param y number
function bor(x, y) end

---
--- Bit xor
---@param x number
---@param y number
function bxor(x, y) end

---
--- Bit not
---@param x number
function bnot(x) end

---
--- Arithmetic shift left (math.)
---@param x number
---@param N number
function shl(x, N) end

---
--- Arithmetic shift right (math.)
---@param x number
---@param N number
function shr(x, N) end

---
--- Logical right shift
---@param x number
---@param N number
function lshr(x, N) end

---
--- Cyclic left shift
---@param x number
---@param N number
function rotl(x, N) end

---
--- Cyclic right shift
---@param x number
---@param N number
function rotr(x, N) end

---
--- Returns a random number n, 0 <= n < x.
--- Note that the return value is not an integer; if an integer is required, use flr(rnd(x)).
--- If x is an array, then randomly return the value of an element in table[1] through table[#table].
---@param x number
function rnd(x) end


---
--- Set the pseudo-random number seed, the same seed will result in the same random sequence later.
---@param x number
function srand(x) end