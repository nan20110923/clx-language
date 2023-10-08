---
--- Get key status (pressed/released).
--- B: 0..7: key numbers
--- Without the argument B, the function returns the status of all keys, using bit bits to indicate the status of each key.
---@param B number
function btn(B) end

---
--- btnp returns the state of the key click, released in the previous frame, and true when currently pressed.
--- If continually kept pressed, then btnp will return a click every 4 frames after 15 frames, the click repeat time parameter can be configured and modified via btnpcfg.
---@param B number
function btnp(B) end

---
--- delay The number of frames of delay before a keystroke.
--- interval The number of frames between keystrokes.
--- btnpcfg(255,0) --- disable pinging
---@param delay number
---@param interval number
function btnpcfg(delay,interval) end

---
--- inputcfg configure touch and key functions, return to last configuration
--- opt.bit0 - enable touch mode
--- opt.bit1 - enable touch analog key mode
---@param opt number
function inputcfg(opt) end

---
--- Query touch status, return x,y,stat,hotid,rectidx of the touch.
--- x,y,stat denotes the position and status of the touch, when stat is 0, x,y is the position of the last release.
--- hotid is the serial number of the hot zone.
--- rectidx is the number of the rectangle inside the hotspot.
function touch() end

---
--- Define a touch hot zone, if no parameter is passed, it means clear all hot zones.
--- hotid - hotid number 1..n, can define the same number of hotid multiple times, equivalent to hotid union, with rectidx zone molecule area
--- flag - hotzone option, 1 means consume the touch event (no touch event will be passed to the background frame)
--- x0,y0,x1,y1 - hotzone rectangles, if x0 is an array, then polygons, polygons with up to 8 vertices. ex: {x1,y1,x2,y2,x3,y3,x4,y4,x5,y5,x6,y6}
--- rectidx - region number, default 1
function touchdef(hotid,flag,x0,y0,x1,y1,rectidx) end