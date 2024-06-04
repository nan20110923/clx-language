---
--- 返回X,Y中较大的值。
---@param X number
---@param Y number
function max(X, Y) end


---
--- 返回X,Y中较小的值。
---@param X number
---@param Y number
function min(X, Y) end

---
--- 返回X,Y,Z大小排列后中间的值。
---@param X number
---@param Y number
---@param Z number
function mid(X, Y, Z) end

---
--- 向上取整。
---@param X number
function ceil(X) end

---
--- 向下取整。
---@param X number
function flr(X) end

---
--- 返回x的正弦值。
--- 注意：和math.sin/math.cos不同，这里根据屏幕坐标方向，y是反向的。
--- x是角度，对应屏幕上逆时针方向，整圆对应0..1。
--- 例如最右边(0度)是0，最左边(180度)是0.5。
---@param X number
function sin(X) end


---
--- 返回x的余弦值。
--- 注意：和math.sin/math.cos不同，这里根据屏幕坐标方向，y是反向的。
--- x是角度，对应屏幕上逆时针方向，整圆对应0..1。
--- 例如最右边(0度)是0，最左边(180度)是0.5。
---@param X number
function cos(X) end

---
--- 根据dx,dy转换到一个角度(0..1)。
--- 角度是对应屏幕逆时针方向。
---@param dx number
---@param dy number
function atan2(dx, dy) end

---
--- 对x开根号，如果x<0，返回0。
---@param x number
function sqrt(x) end


---
--- 返回x的绝对值。
---@param x number
function abs(x) end

---
--- 返回x的符号，x<0返回-1，x>=0返回1。
---@param x number
function sgn(x) end

---
--- 与运算
---@param x number
---@param y number
function band(x, y) end

---
--- 或运算
---@param x number
---@param y number
function bor(x, y) end

---
--- 异或运算
---@param x number
---@param y number
function bxor(x, y) end

---
--- 非运算
---@param x number
function bnot(x) end

---
--- 算数左移
---@param x number
---@param N number
function shl(x, N) end

---
--- 算数右移
---@param x number
---@param N number
function shr(x, N) end

---
--- 逻辑右移
---@param x number
---@param N number
function lshr(x, N) end

---
--- 循环左移
---@param x number
---@param N number
function rotl(x, N) end

---
--- 循环右移
---@param x number
---@param N number
function rotr(x, N) end

---
--- 返回一个随机数n，0 <= n < x。
--- 注意，返回值不是整数，如果需要整数，使用flr(rnd(x))。
--- 如果x是个数组，那么随机返回table[1]到table[#table]中的一个元素值。
---@param x number
function rnd(x) end


---
--- 设置伪随机数种子，同样的种子会导致后面的随机序列相同。
---@param x number
function srand(x) end