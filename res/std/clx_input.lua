---
--- 获取按键状态(按下/释放)。
--- B: 0..7: 按键编号
--- 如果没有参数B，函数返回所有按键状态，使用bit位来表示每个按键的状态。
---@param B number
function btn(B) end

---
--- btnp返回按键点击状态，前一帧释放，当前按下时，返回true。
--- 如果持续保持按下，那么btnp会在15帧后，每4帧返回一次点击，点击重复的时间参数可以通过btnpcfg来进行配置修改。
---@param B number
function btnp(B) end

---
--- delay 连击按键前延时的帧数
--- interval 连击的间隔帧数
--- btnpcfg(255,0) -- 禁用连击
---@param delay number
---@param interval number
function btnpcfg(delay,interval) end

---
--- inputcfg 配置触摸和按键功能，返回上次的配置
--- opt.bit0 - 使能触摸模式
--- opt.bit1 - 使能触摸模拟按键模式
---@param opt number
function inputcfg(opt) end

---
--- 查询触摸状态，返回触摸的x,y,stat,hotid,rectidx。
--- x,y,stat 表示触摸位置和状态，stat为0时，x,y是上一次释放的位置
--- hotid 是所在热区序号
--- rectidx 是热区里面的矩形编号
function touch() end

---
--- 定义一个触摸热区，如果不传参数，表示清除所有热区。
--- hotid - 热区编号 1..n，可以多次定义相同编号的热区，相当于热区联合，用rectidx区分子区域
--- flag -热区选项，1表示消耗掉触摸事件(不会向背景框架传递触摸事件)
--- x0,y0,x1,y1 - 热区矩形, 如果x0是数组,那么就是多边形, 多边形最多8个顶点. ex: {x1,y1,x2,y2,x3,y3,x4,y4,x5,y5,x6,y6}
--- rectidx - 区域编号，默认1
function touchdef(hotid,flag,x0,y0,x1,y1,rectidx) end