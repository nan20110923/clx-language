--[[ common data ]]--
---
--- Canvas width
__vm_width = 454

---
--- Canvas height
__vm_height = 454

---
--- Canvas Pixel Bits
__vm_bpp = 1

---
--- Device speed level (0-100), the higher the hardware speed, the larger the number
__vm_speed_lvl = 100

---
--- Physical screen width
__vm_scr_width = 454

---
--- Physical screen height
__vm_scr_height = 454

---
--- Whether the development environment
__vm_auto_gen_rom = true



--[[ builtin colors ]]--
black = 0x000000
dark_blue = 0x1d2b53
dark_purple = 0x7e2553
dark_green = 0x008751
brown = 0xab5236
dark_gray = 0x5f574f
light_gray = 0xc2c3c7
white = 0xfff1e8
red = 0xff004d
orange = 0xffa300
yellow = 0xffec27
green = 0x00e436
blue = 0x29adff
indigo = 0x83769c
pink = 0xff77a8
peach = 0xffccaa

--[[ memory address ]] --
---
--- Sprite data address
__vm_GFX = 0x0

---
--- Map data address
__vm_MAP = 0x0

---
--- Sprite flag data address
__vm_FLAGS = 0x0

---
--- Music data address
__vm_MUSIC = 0x0

---
--- Audio address
__vm_SFX = 0x0

---
--- User data address
__vm_USERDATA = 0x0

---
--- Application storage data mapping address
__vm_CARTDATA = 0x0

---
--- Video memory address (corresponding to the canvas)
__vm_VRAM = 0x0

---
--- Drawing state address
__vm_DRAWSTAT = 0x0

---
--- Hardware status address
__vm_HWSTAT = 0x0





--[[ api ]]--
---
--- Set the clipping rectangle in pixels. All drawing operations will be clipped to a rectangle at x,y and width w,h.
--- clip() to reset.
--- When CLIP_PREVIOUS is true, clip the new clipping region with the old clipping region.
---@param X number
---@param Y number
---@param W number
---@param H number
---@param CLIP_PREVIOUS boolean
function clip(X, Y, W, H, CLIP_PREVIOUS) end

---
--- Set the pixel at x, y to a specific color.
--- If COL is not specified, the current drawing color is used.
---@param X number
---@param Y number
---@param COL number
function pset(X, Y, COL) end

---
--- Get the color of the pixel at (X, Y) on the screen.
--- PS: pget returns 0 when X and Y are out of range.
---@param X number
---@param Y number
function pget(X, Y) end

---
--- Set the color (COL) of a sprite sheet pixel.
---@param X number
---@param Y number
---@param COL number
function sset(X, Y, COL) end

---
--- Get the color (COL) of a sprite sheet pixel.
--- PS: sget returns 0 when X and Y are out of range.
---@param X number
---@param Y number
function sget(X, Y) end


---
--- Set the value (VAL) of the flag F of sprite N.
--- F is the flag index 0..7.
--- VAL is TRUE or FALSE.
--- The initial state of flags 0..7 can be set in the sprite editor and thus can be used to create custom sprite properties.
--- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
--- When F is omitted, all flags are retrieved/set as a single bitfield.
---@param N number
---@param F number
---@param VAL boolean
function fset(N, F, VAL) end

---
--- Get the value (VAL) of the flag F of sprite N.
--- F is the flag index 0..7.
--- VAL is TRUE or FALSE.
--- The initial state of flags 0..7 can be set in the sprite editor and thus can be used to create custom sprite properties.
--- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
--- When F is omitted, all flags are retrieved/set as a single bitfield.
---@param N number
---@param F number
function fget(X, Y) end

---
--- Convert codepage from gb2312 to utf8 print/drawTxt_h only support utf8
---@param gb2312 string
---@return string
function gb2312_to_utf8(gb2312) end


---
--- Convert codepage from gb2312 to utf8 print/drawTxt_h only support utf8
---@param gb2312 string
---@return string
function gb2312_to_utf8(gb2312) end