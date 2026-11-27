---@meta

--[[ common data ]]--
---
--- Canvas width in pixels (set by the spec line of the .clx file)
__vm_width = 240

---
--- Canvas height in pixels
__vm_height = 240

---
--- Canvas color depth: 4, 16 or 32 bits per pixel
__vm_bpp = 16

---
--- Device speed level (0-100), the higher the hardware speed, the larger the number
__vm_speed_lvl = 100

---
--- Physical screen width in pixels (may differ from the canvas)
__vm_scr_width = 240

---
--- Physical screen height in pixels
__vm_scr_height = 240

---
--- True in a development build; undefined (nil) on a device
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


--[[ memory address ]]--
---
--- Sprite image data address
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
--- SFX data address
__vm_SFX = 0x0

---
--- User data address
__vm_USERDATA = 0x0

---
--- Application storage data mapping address
__vm_CARTDATA = 0x0

---
--- Video memory address (the canvas)
__vm_VRAM = 0x0

---
--- Drawing state address
__vm_DRAWSTAT = 0x0

---
--- Hardware status address
__vm_HWSTAT = 0x0


--[[ canvas ]]--
---
--- Clears the screen and resets the clip rectangle and print state. COL defaults to 0 (black).
---@param COL? number
function cls(COL) end

---
--- Sets the screen offset for all later drawing: the actual position is (x,y) minus (X,Y).
--- Called without arguments it restores the default (no offset).
---@param X? number
---@param Y? number
---@return number old_x
---@return number old_y
function camera(X, Y) end

---
--- Sets the clipping rectangle spanning W,H at X,Y. All drawing is clipped to it.
--- Called without arguments it resets the clip to the whole screen.
--- When CLIP_PREVIOUS is true the new rectangle is intersected with the old one.
---@param X? number
---@param Y? number
---@param W? number
---@param H? number
---@param CLIP_PREVIOUS? boolean
---@return number old_x
---@return number old_y
---@return number old_w
---@return number old_h
function clip(X, Y, W, H, CLIP_PREVIOUS) end

---
--- Presents the current canvas immediately instead of waiting for the next `_draw`.
--- Useful to refresh progress inside a long loop.
function flip() end


--[[ color ]]--
---
--- Sets the current drawing color. COL defaults to light_gray (0xc2c3c7).
---@param COL? number
---@return number old_col
function color(COL) end

---
--- Sets palette index IDX to the given color and returns the color value,
--- which can be passed to every drawing function that takes a color.
---@param idx number
---@param r number
---@param g number
---@param b number
---@param a? number
---@return number color_value
function palrgb(idx, r, g, b, a) end

---
--- Returns a color value for RGB(A). In palette modes the closest palette entry is used.
---@param r number
---@param g number
---@param b number
---@param a? number
---@return number color_value
function getcolor(r, g, b, a) end

---
--- Color remapping. P selects the table (0 = drawing palette, default; 1 = display palette; 2 = secondary).
--- Called without arguments it resets all palettes; pal(0) resets the drawing palette, pal(1) the display one.
--- A table argument sets several entries at once, e.g. pal({[12] = 9, [14] = 8}).
---@param C0? number|table
---@param C1? number
---@param P? number
---@return number old_mapping
function pal(C0, C1, P) end

---
--- Sets color transparency. T = true makes the color transparent, false makes it opaque.
--- palt() restores the default (only color 0 is transparent).
--- A single argument is treated as a bitfield for all 16 colors.
---@param C? number
---@param T? boolean
---@return number old_bitfield
function palt(C, T) end

---
--- Sets the 4x4 two-color fill pattern and returns the previous pattern. fillp(0) restores a solid fill.
--- Affects circ, circfill, rect, rectfill, polygonfill, trifill, oval, ovalfill, pset, line and lines.
---@param P number
---@return number old_pattern
function fillp(P) end


--[[ pixel ]]--
---
--- Sets the pixel at (X,Y) to COL, or to the current color when COL is omitted.
---@param X number
---@param Y number
---@param COL? number
function pset(X, Y, COL) end

---
--- Returns the screen pixel color at (X,Y); 0 when out of range.
---@param X number
---@param Y number
---@return number color
function pget(X, Y) end

---
--- Returns the sprite sheet pixel color at (X,Y); 0 when out of range.
---@param X number
---@param Y number
---@return number color
function sget(X, Y) end

---
--- Sets the sprite sheet pixel at (X,Y) to COL, or to the current color when COL is omitted.
---@param X number
---@param Y number
---@param COL? number
function sset(X, Y, COL) end


--[[ shape ]]--
---
--- Draws a line from (X0,Y0) to (X1,Y1). Without (X1,Y1) it continues from the previous endpoint;
--- line() with no arguments resets that endpoint.
---@param X0? number
---@param Y0? number
---@param X1? number
---@param Y1? number
---@param COL? number
function line(X0, Y0, X1, Y1, COL) end

---
--- Draws a polyline through the flat coordinate table COORDS = {x0,y0,x1,y1,...}.
--- CLOSE = true also draws the segment back to the first point.
---@param coords table
---@param COL? number
---@param CLOSE? boolean
function lines(coords, COL, CLOSE) end

---
--- Draws a line of the given WIDTH from (X0,Y0) to (X1,Y1).
---@param WIDTH number
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function wline(WIDTH, X0, Y0, X1, Y1, COL) end

---
--- Draws a Bezier curve through the flat coordinate table COORDS.
--- 6 numbers = quadratic (3 control points), 8 numbers = cubic (4 control points); up to 63 numbers.
--- SEGMENTS is the subdivision count per curve segment (default 2), WIDTH the line width (default 1).
---@param coords table
---@param segments? number
---@param COL? number
---@param WIDTH? number
function bezier(coords, segments, COL, WIDTH) end

---
--- Draws a rectangle outline from (X0,Y0) to (X1,Y1).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function rect(X0, Y0, X1, Y1, COL) end

---
--- Draws a filled rectangle from (X0,Y0) to (X1,Y1).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function rectfill(X0, Y0, X1, Y1, COL) end

---
--- Fills a rectangle with COL, bypassing pal() remapping and fillp() patterns.
--- Meant for fast region clearing; camera and clip still apply. COL is required.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function rectcls(X0, Y0, X1, Y1, COL) end

---
--- Draws a circle outline of radius R centered at (X,Y). Nothing is drawn for R < 0.
---@param X number
---@param Y number
---@param R number
---@param COL? number
function circ(X, Y, R, COL) end

---
--- Draws a filled circle of radius R centered at (X,Y). Nothing is drawn for R < 0.
---@param X number
---@param Y number
---@param R number
---@param COL? number
function circfill(X, Y, R, COL) end

---
--- Draws an ellipse outline inside the bounding rectangle (X0,Y0)-(X1,Y1).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function oval(X0, Y0, X1, Y1, COL) end

---
--- Draws a filled ellipse inside the bounding rectangle (X0,Y0)-(X1,Y1).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function ovalfill(X0, Y0, X1, Y1, COL) end

---
--- Draws an arc counterclockwise from ANGLE1 to ANGLE2 (degrees in [-180,180],
--- 0 is (R,0), 90 is (0,-R)).
---@param X number
---@param Y number
---@param R number
---@param ANGLE1 number
---@param ANGLE2 number
---@param COL? number
function arc(X, Y, R, ANGLE1, ANGLE2, COL) end

---
--- Fills a polygon given as a flat coordinate table (3 to 64 point pairs).
---@param polygon table
---@param COL? number
function polygonfill(polygon, COL) end

---
--- Fills a triangle.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param X2 number
---@param Y2 number
---@param COL? number
function trifill(X0, Y0, X1, Y1, X2, Y2, COL) end


--[[ sprite ]]--
---
--- Draws sprite N at (X,Y). W,H is the size in 8x8 sprite blocks (default 1,1).
--- Color 0 is transparent by default (see palt()).
---@param N number
---@param X number
---@param Y number
---@param W? number
---@param H? number
---@param FLIP_X? boolean
---@param FLIP_Y? boolean
function spr(N, X, Y, W, H, FLIP_X, FLIP_Y) end

---
--- Stretches the sprite sheet rectangle (SX,SY,SW,SH) onto the screen rectangle
--- (DX,DY,DW,DH). DW,DH default to SW,SH.
---@param SX number
---@param SY number
---@param SW number
---@param SH number
---@param DX number
---@param DY number
---@param DW? number
---@param DH? number
---@param FLIP_X? boolean
---@param FLIP_Y? boolean
function sspr(SX, SY, SW, SH, DX, DY, DW, DH, FLIP_X, FLIP_Y) end

---
--- Like sspr() but with rotation and scaling. ANGLE is in degrees.
---@param SX number
---@param SY number
---@param SW number
---@param SH number
---@param DX number
---@param DY number
---@param ANGLE number
---@param ZOOMX? number
---@param ZOOMY? number
function rotspr(SX, SY, SW, SH, DX, DY, ANGLE, ZOOMX, ZOOMY) end

---
--- Draws a textured line from (X0,Y0) to (X1,Y1) sampled from the sprite sheet at (SPRX,SPRY).
--- SPRDX,SPRDY are the sampling increments (default 1/8, 0).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param SPRX number
---@param SPRY number
---@param SPRDX? number
---@param SPRDY? number
function tspr(X0, Y0, X1, Y1, SPRX, SPRY, SPRDX, SPRDY) end

---
--- Returns the flags of sprite N. F is a flag index 0..7 and yields a boolean;
--- omitting F yields the whole bitfield.
---@param N number
---@param F? number
---@return boolean|number value
function fget(N, F) end

---
--- Sets the flags of sprite N. With F it sets that single flag to VAL (boolean);
--- without F, VAL is used as the whole bitfield.
---@param N number
---@param F? number|boolean
---@param VAL? number|boolean
function fset(N, F, VAL) end


--[[ image block ]]--
---
--- Draws a raw image data block at (X,Y).
--- OPFLAG: bit0 = alpha blend (32bpp only), bit1-2 = x anchor (0 left, 1 right, 2 center),
--- bit3-4 = y anchor (0 top, 1 bottom, 2 center).
--- DATA can be the string "SPR" (use the sprite sheet) or "SCR" (use the screen) to ignore
--- LINEBYTES,W,H,BPP. FLAG: bit0 = premultiplied alpha, bit1 = swap blue/red, bit2 = opaque.
--- SX,SY,SW,SH select the source rectangle to draw.
---@param x number
---@param y number
---@param opflag number
---@param data string
---@param linebytes? number
---@param w? number
---@param h? number
---@param bpp? number
---@param flag? number
---@param sx? number
---@param sy? number
---@param sw? number
---@param sh? number
---@return boolean ok
function blit(x, y, opflag, data, linebytes, w, h, bpp, flag, sx, sy, sw, sh) end


--[[ qrcode ]]--
---
--- Draws a QR code for STR spanning (x,y)-(x+w,y+w). The background must be filled
--- beforehand: only the dark modules are drawn. Returns the code width in pixels
--- (0 when the code does not fit or W is too small).
---@param str string
---@param col? number
---@param w? number
---@param x? number
---@param y? number
---@return number raw_width
function qrcode(str, col, w, x, y) end
