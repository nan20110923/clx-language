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





-- --[[ api ]]--
---
--- Set the clipping rectangle in pixels. All drawing operations will be clipped to a rectangle with width and height w,h at x, y. --- Clip() to reset.
--- clip() performs a reset.
--- When CLIP_PREVIOUS is true, the new clipping area is clipped with the old clipping area.
---@param Y number
---@param X number
---@param W number
---@param H number
---@param CLIP_PREVIOUS boolean
function clip(X, Y, W, H, CLIP_PREVIOUS) end


---
--- Sets pixels at (X, Y) on the screen to a specific color.
--- If COL is not specified, the current drawing color is used.
---@param X number
---@param Y number
---@param COL number
function pset(X, Y, COL) end

---
--- Returns the color of pixels at (X, Y) on the screen.
--- pget returns 0 when X and Y are out of range.
---@param X number
---@param Y number
function pget(X, Y) end

---
--- Sets the color (COL) of the sprite table pixels.
---@param X number
---@param Y number
---@param COL number
function sset(X, Y, COL) end

---
--- Gets the color (COL) of the pixels of the sprite table.
--- sget returns 0 when X and Y are out of range.
---@param X number
---@param Y number
function sget(X, Y) end


---
--- Sets the value of flag F (VAL) for sprite N.
--- F is the flag index 0..7.
--- VAL is TRUE or FALSE.
--- The initial state of flags 0..7 can be set in the sprite editor, and can therefore be used to create custom sprite properties. It is also possible to draw only a subset of the map plots by providing a mask in MAP().
--- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
--- When F is omitted, all flags are set to a single bit field.
---@param N number
---@param F number
---@param VAL boolean
function fset(N, F, VAL) end

---
--- Get the value (VAL) of flag F of sprite N.
--- F is the flag index 0..7.
--- The initial state of flags 0..7 can be set in the sprite editor, so it can be used to create custom sprite properties. It is also possible to draw only a subset of the map plots by providing a mask in MAP().
--- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
--- When F is omitted, all flags are retrieved as a single bit field.
---@param N number
---@param F number
function fget(N, F) end

---
--- Convert gb2312 encoded strings to utf8 encoding
---@param gb2312 string
---@return string
function gb2312_to_utf8(gb2312) end



---
--- print is a device-independent printing interface.
--- print supports special escaping within STR, only utf8 encoding is supported
--- OPT is the print option:
---   bit0: under-coordinate alignment
---   bit1-2: alignment mode, 1 means right-aligned, 2 means center-aligned, 3 means no draw (return width), note that print does not support this, drawTxt_h takes effect.
---   bit7: print without line breaks
---   bit8-15: word spacing, 8bit int(ver>=10 can be negative)
--- SIZE is the font size, if it is an unsupported size, the default size will be used.
--- FONT is the font name, if it is an unsupported size the default will be used.
---   Fonts supported: English 8(8x8), 16(8x16), default 4(4x6), Chinese 16(16x16).
---@param STR string
---@param X number
---@param Y number
---@param COL number
---@param OPT number
---@param SIZE number
---@param FONT number
function print(STR, X, Y, COL, OPT, SIZE, FONT) end


---
--- drawTxt_h is the host type-dependent print interface, which works differently on different hosts.
--- OPT is the print option:
---   bit0: under-coordinate alignment
---   bit1-2: alignment mode, 1 means right-aligned, 2 means center-aligned, 3 means no draw (return width), note that print does not support this, drawTxt_h takes effect.
---   bit7: print without line breaks
---   bit8-15: word spacing
--- SIZE is the font size, if it is an unsupported size, the default size will be used.
--- FONT is the font name, if it is an unsupported size the default will be used.
---   Supported:
---     ver < 10: Colo-PLAY 8,12,20,32,16 (unsc,cjk,phb), default 12.
---     ver >= 10:  Colo-PLAY any (ascii,mascii,wascii,DIN\_NATURE\_Bold,gp,dig,vampire)
---     NatureMiniPro any(default, ascii, mascii, wascii, DIN\_NATURE\_Bold, gp, dig, vampire).
---@param STR string
---@param X number
---@param Y number
---@param COL number
---@param OPT number
---@param SIZE number
---@param FONT number
function drawTxt_h(STR, X, Y, COL, OPT, SIZE, FONT) end

---
--- ver >= 10
--- Load custom truetype font.
--- name is the font name
--- size is the font size, ttfdata is the font data, cache is the cache size, rbname is the cache name.
--- cache is cache size. nil or invald size will be default.
--- rbname rollback font name when can't find char data.
--- return fontobj
---   **Notice, you should keep it to avoid gc**
--- font data should be string obj, for rom size limit, you need cut ttf file, only include font data needed.
---@param name string
---@param size number
---@param ttfdata string
---@param cache number
---@param rbname string
---@return table
function font_add(name, size, ttfdata, cache, rbname) end

---
--- ver >= 10
--- Remove font object from font_add
--- font font_add返回的字体对象
---@param global boolean
function font_close(global) end

---
--- ver >= 10
--- Clear font cache for saving memory
--- global true means clear custom and global font cache, false means clear custom font cache only
---  **Notice, After rendering with large fonts, it is better to call font_shrink to release the font cache to avoid too much memory usage.**
---@param global boolean
function font_shrink(global) end

---
--- Set the cursor position.
--- If COL is specified, also sets the current color.
---@param X number
---@param Y number
---@param COL number
function cursor(X, Y, COL) end


---
--- Sets the current color used by the plotting function.
--- If COL is not specified, the current color is set to light_gray(rgb=#c2c3c7).
---@param COL number
function color(COL) end


---
--- Clears the screen and resets the clip rectangle and print status.
--- COL defaults to 0 (black).
---@param COL number
function cls(COL) end


---
--- Set -x, -y screen offsets for all drawing operations.
--- camera() restores the default state.
---@param X number
---@param Y number
function camera(X, Y) end

---
--- Draw an arc, counterclockwise from angle1 to angle2 angle needs to be in the range [-180,180],
--- 0 is point [R,0], 90 is point [0,-R].
---@param X number
---@param Y number
---@param R number
---@param ANGLE1 number
---@param ANGLE2 number
---@param COL number
function arc(X, Y, R, ANGLE1, ANGLE2, COL) end

---
--- Draws a circle with radius R centered at (X, Y).
--- If R is negative, no circle is drawn.
---@param X number
---@param Y number
---@param R number
---@param COL number
function circ(X, Y, R, COL) end


---
--- Draws a solid circle with radius R centered at (X, Y).
--- If R is negative, no circle is drawn.
---@param X number
---@param Y number
---@param R number
---@param COL number
function circfill(X, Y, R, COL) end


---
--- Draws an ellipse symmetric in x and y using the given bounding rectangle.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function oval(X0, Y0, X1, Y1, COL) end


---
--- Draws a solid ellipse symmetric in x and y using the given bounding rectangle.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function ovalfill(X0, Y0, X1, Y1, COL) end

---
--- Draws a line from (X0, Y0) to (X1, Y1).
--- If (X1, Y1) is not given, the end of the last drawn line is used.
--- line() without an argument means that the next call to line(X1, Y1) will just set the end point and not draw it.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function line(X0, Y0, X1, Y1, COL) end


---
--- Draw line segments based on the coordinates inside the table.
--- CLOSE means closed line segment (will be connected to x0,y0).
--- lineTbl: {x0, y0, x1, y1, ...}
---@param lineTbl table
---@param COL number
---@param CLOSE boolean
function lines(lineTbl, COL, CLOSE) end

---
--- Draw a rectangle at (X0, Y0), (X1, Y1).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function rect(X0, Y0, X1, Y1, COL) end

---
--- Draw a filled rectangle at (X0, Y0), (X1, Y1).
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function rectfill(X0, Y0, X1, Y1, COL) end

---
--- Polygon fill based on the coordinates inside the table, note that you need at least 3 sets of points inside the table, and up to 64 sets of points.
--- polygon: {x0, y0, x1, y1, ...}
---@param polygon table
---@param COL number
function polygonfill(polygon, COL) end


---
--- Triangle fill.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param X2 number
---@param Y2 number
---@param COL number
function trifill(X0,Y0,X1,Y1,X2,Y2,COL) end


---
--- Replaces color C0 with C1 for one of the three palette remaps (P defaults to 0):
---   0: draws the color palette
---   1: Display palette
---   2: Secondary palette
---@param C0 number
---@param C1 number
---@param P number
function pal(C0, C1, P) end


---
--- Set color index transparency to T (boolean) Draw transparency via spr(), sspr(), map(), and tline():
--- palt() reset to default: all colors except color 0 are opaque
--- When C is the only argument, it is treated as a bitfield for setting all 16 values. Example: set colors 0 and 1 to transparent:
---@param C number
---@param T boolean
function palt(C, T) end


---
--- Draw sprites N (0..n) at position X,Y.
--- W (width) and H (height) are both 1 by default, indicating how many sprite blocks.
--- Color 0 is drawn transparent by default (see palt()).
--- Flip horizontally when FLIP_X is true.
--- Flips vertically when FLIP_Y is true.
---@param N number
---@param X number
---@param Y number
---@param W number
---@param H number
---@param FLIP_X boolean
---@param FLIP_Y boolean
function spr(N, X, Y, W, H, FLIP_X, FLIP_Y) end

---
--- Stretches the rectangle (sx, sy, sw, sh) of the sprite image to the target rectangle (sx, sy, dw, dh) on the screen.
--- In both cases, the x and y values are the coordinates (in pixels) of the upper-left corner of the rectangle, and the widths are w, h.
--- Color 0 is drawn transparent by default, see palt().
--- dw, dh defaults to sw, sh.
--- When FLIP_X is true, flip horizontally.
--- Flip vertically when FLIP_Y is true.
---@param SX number
---@param SY number
---@param SW number
---@param SH number
---@param DX number
---@param DY number
---@param DW number
---@param DH number
---@param FLIP_X boolean
---@param FLIP_Y boolean
function sspr(SX, SY, SW, SH, DX, DY, DW, DH, FLIP_X, FLIP_Y) end

---
--- Draw a texture line from (X0,Y0) to (X1,Y1), get texture data from MX,MY of map.
--- MDX: the increment of texture data in X direction, default is 1/8.
--- MDY: the increment of texture data in Y direction, default is 0.
--- statctl(tlmw/tlmh/tlmx/tlmy) can control the texture mapping method.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param MX number
---@param MY number
---@param MDX number
---@param MDY number
function tline(X0, Y0, X1, Y1, MX, MY, MDX, MDY) end


---
--- Draw a texture line from (X0,Y0) to (X1,Y1), the texture data is obtained from SPRX,SPRY of Sprite.
--- SPRDX: the increment of texture data in X direction, default 1/8.
--- SPRDY: the increment of texture data in Y direction, default is 0.
--- statctl(tlmw/tlmh) can control the texture mapping method.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param SPRX number
---@param SPRY number
---@param SPRDX number
---@param SPRDY number
function tspr(X0, Y0, X1, Y1, SPRX, SPRY, SPRDX, SPRDY) end

---
--- The program fill pattern is a 4x4 2-color tiled pattern that affects the following plotting functions:
--- circ, circfill, rect, rectfill, polygonfill, trifill, oval, ovalFill, pset, line, lines
--- P is the bit field in which the order of reading starts from the highest bit. To calculate the P value for a desired pattern, add the bit values together
---@param P number
function fillp(P) end

---
--- Drawing of the image data block
--- x,y coordinates of the upper-left corner of the drawing.
--- opflag drawing strategy.
---   bit0 1 for alpha blend drawing (only valid for 32 bit color mode)
---   bit1-2 for x-direction anchor 0:left,1:right,2:center
---   bit3-4 for y-direction anchor 0:top,1:bottom,2:center
--- data image data, data can be special data, at this time linebytes,w,h,bpp ignore::.
---   "SPR" means use sfx image directly.
---   "SCR" means use screen directly.
--- linebytes Length of each line of data
--- w,h,bpp image width and height and bits per pixel
--- flag Image data attributes:
---   bit0 premul data (32-bit color, premultiplied alpha)
---   bit1 swap_br (need to swap blue/red data)
---   bit2 OPAQUE (opaque, alpha disabled)
--- sx,sy,sw,sh selects the image rectangle to be plotted
---@param x number
---@param y number
---@param opflag number
---@param data string
---@param linebytes number
---@param w number
---@param h number
---@param bpp number
---@param flag number
---@param sx number
---@param sy number
---@param sw number
---@param sh number
function blit(x,y,opflag,data,linebytes,w,h,bpp,flag,sx,sy,sw,sh) end


---
--- Similar to sspr, but with support for rotation angles and scaling.
---@param SX number
---@param SY number
---@param SW number
---@param SH number
---@param DX number
---@param DY number
---@param ANGLE number
---@param ZOOMX number
---@param ZOOMY number
function rotspr(SX, SY, SW, SH, DX, DY, ANGLE, ZOOMX, ZOOMY) end



---
--- Sets the palette color and returns the color value (this color value can be used as a COL for other plotting functions).
---@param idx number
---@param r number
---@param g number
---@param b number
---@return number
function palrgb(idx,r,g,b,a) end

---
--- Returns color values that can be used in plotting functions.
--- Note that for palette mode, the closest palette color is looked for.
---@param r number
---@param g number
---@param b number
---@param a number
---@return number
function getcolor(r,g,b,a) end


--- ver >= 11
--- draw qrcode at pos (x,y)-(x+w,y+w)
--- if image out screen or w too small , will draw nothing.
---  **Note funciton will only draw valid point, backgrand need fill first.
---@param str string
---@param col number
---@param w number
---@param x number
---@param y number
---@return qrcode size(px width) number
function qrcode(str,col,w,x,y) end


---
--- Load image data (png/jpg format), if the bpp parameter is provided, it will be converted to the corresponding image format, otherwise the installation system specification is converted.
--- Support load gif image(version >= 6).
---   Load only first frame by default
---   All frames can be loaded by parameter gifall:gif=img_gif_load(gifdata,nil,nil,true)
---   Multiple frames will be stitched together into one image in Y direction.
---   Note that loading all frames will consume a lot of memory, try to avoid it, calculate the memory usage.
--- Support load webp image(version >= 12).
---   Only bpp = 16 or 32
--- Return the image object img.
---@param picdata string
---@param bpp number
---@param flag number
---@param gifall any
---@return table
function img_load(picdata,bpp,flag,gifall) end


---
--- Immediate release of img resources.
---@param img table
function img_close(img) end


---
--- Return w,h,bpp,flag of the image.
--- if gif, return w,h,bpp,flag,frame_h,delays
---   frame_h: frame height
---   delays: an array holding the presentation time (ms) per frame.
---@param img table
function img_info(img) end

---
--- Paste the image to the x,y position, opflag refers to the parameters of blit.
---@param img table
---@param x number
---@param y number
---@param opflag number
function img_draw(img,x,y,opflag) end


---
--- Paste a specific area of the image to the x,y position, opflag refers to the parameters of blit.
---@param img table
---@param x number
---@param y number
---@param opflag number
---@param sx number
---@param sy number
---@param sw number
---@param sh number
function img_drawex(img,x,y,opflag,sx,sy,sw,sh) end

--- ver >= 12
--- refers to the rotspr
--- img's bpp must be same with spec bpp
--- OPFLAG : now please use 1
--- SX,SY,SW,SH must in the img's area
---@param img table
---@param SX number
---@param SY number
---@param SW number
---@param SH number
---@param DX number
---@param DY number
---@param ANGLE number
---@param ZOOMX number
---@param ZOOMY number
function img_drawrot(img, DX, DY, OPFLAG, SX, SY, SW, SH, ANGLE, ZOOM) end

--- ver >= 12
--- zoom draw img
--- img's bpp must be same with spec bpp
--- OPFLAG :
---   bit0 : should be 1 
---   bit8 : 1 for x flip
---   bit9 : 1 for y flip
--- SX,SY,SW,SH must in the img's area
---@param img table
---@param DX number
---@param DY number
---@param DW number
---@param DH number
---@param SX number
---@param SY number
---@param SW number
---@param SH number
---@param OPFLAG number
function img_drawzoom(img, DX, DY, DW, DH, SX, SY, SW, SH, OPFLAG) end

---
--- Paste a specific region of a gif image frame to x,y position, opflag refer to blit's parameter.
--- Return: current frame number, delay time needed.
---@param img table
---@param frameidx number
---@param x number
---@param y number
---@param opflag number
---@param sx number
---@param sy number
---@param sw number
---@param sh number
function img_drawgif(img,frameidx,x,y,opflag,sx,sy,sw,sh) end


---
--- Load gif image data, if bpp parameter is provided, it will be converted to corresponding image format, otherwise install system specification conversion.
--- Functions will dynamically render the required frames, saving memory.
--- Returns the image object.
---@param picdata string
---@param bpp number
---@return table
function img_gif_load(picdata,bpp) end


---
--- Load gif file, if bpp parameter is provided, it will be converted to corresponding image format, otherwise install system specification conversion.
--- Functions will dynamically render the required frames, saving memory.
--- Returns the image object.
---@param filename string
---@param bpp number
---@return table
function img_gif_file(filename,bpp) end

---
--- Update frames as needed
--- return nil means no update return integer 0 means the gif animation is over, 1 means the image has been updated
---@param img table
---@return any
function img_gif_next(img) end

---
--- Load image data (webp format), if the bpp parameter is provided, it will be converted to the corresponding image format, otherwise, the system specification conversion will be installed. bpp must be 16 or 32
--- return img obj and full webp pic width/height : img, fullwidth, fullheight
--- opt: bit0=1 use crop area, bit1=1 use scale
--- crop[x,y,w,h] crop params
--- sw,sh scale to sw,sh, only support zoom in
---@param picdata string
---@param bpp number
---@param flag number
---@param opt number
---@param cropx number
---@param cropy number
---@param cropw number
---@param croph number
---@param sw number
---@param sh number
function img_loadwebp(picdata,bpp,flag,opt,cropx,cropy,cropw,croph,sw,sh) end

---
--- Load rlottie animation data, key is id (cont must be the same for the same id), w/h is render size,
--- return animation object.
---@param key any
---@param cont any
---@param w number
---@param h number
---@return table
function rlottie_load(key,cont,w,h) end

---
--- Immediate release of animation resources.
---@param ani table
function rlottie_close(ani) end

---
--- Get rlottie object information
--- Returns current frame, total frames, animation frame rate, image width, image height.
---@param ani table
---@return number, number, number, number, number
function rlottie_info(ani) end

---
--- Draws a specific frame of the animation to the x,y position.
---@param ani table
---@param frameidx number
---@param x number
---@param y number
function rlottie_draw(ani,frameidx,x,y) end


---
--- Sets property parameters on the animation path.
---@param ani table
---@param proptype any
---@param keypath any
---@param v1 any
---@param v2 any
---@param v3 any
function rlottie_prop(ani,proptype,keypath,v1,v2,v3) end


---
--- Returns animated zones as a table {{name,frm_begin,frm_end},...}
---@param ani table
function rlottie_mark(ani) end

