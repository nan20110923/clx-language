---@meta

--[[ 通用常量 ]]--
---
--- 画布宽度（像素，由 .clx 文件首行的规格声明决定）
__vm_width = 240

---
--- 画布高度（像素）
__vm_height = 240

---
--- 画布色深：每像素 4 / 16 / 32 位
__vm_bpp = 16

---
--- 设备速度级别（0-100），硬件性能越强数值越大
__vm_speed_lvl = 100

---
--- 物理屏幕宽度（像素，可能与画布不同）
__vm_scr_width = 240

---
--- 物理屏幕高度（像素）
__vm_scr_height = 240

---
--- 是否为开发构建；设备上未定义（nil）
__vm_auto_gen_rom = true


--[[ 内建颜色 ]]--
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


--[[ 内存地址 ]]--
---
--- 精灵图像数据地址
__vm_GFX = 0x0

---
--- 地图数据地址
__vm_MAP = 0x0

---
--- 精灵标志数据地址
__vm_FLAGS = 0x0

---
--- 音乐数据地址
__vm_MUSIC = 0x0

---
--- 音效数据地址
__vm_SFX = 0x0

---
--- 用户数据地址
__vm_USERDATA = 0x0

---
--- 应用存储数据映射地址
__vm_CARTDATA = 0x0

---
--- 显存地址（对应画布）
__vm_VRAM = 0x0

---
--- 绘图状态地址
__vm_DRAWSTAT = 0x0

---
--- 硬件状态地址
__vm_HWSTAT = 0x0


--[[ 画布 ]]--
---
--- 清除屏幕，并重置裁剪矩形与打印状态。COL 默认为 0（黑色）。
---@param COL? number
function cls(COL) end

---
--- 为之后所有绘图设置屏幕偏移：实际绘制位置 = 原坐标 - (X, Y)。
--- 不带参数调用恢复默认（无偏移）。
---@param X? number
---@param Y? number
---@return number old_x
---@return number old_y
function camera(X, Y) end

---
--- 设置裁剪矩形（以 X,Y 为左上角，宽高 W,H），所有绘图只在该区域内生效。
--- 不带参数调用重置为全屏；CLIP_PREVIOUS 为 true 时新区域与旧区域取交集。
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
--- 立即呈现当前画布，不等下一帧 `_draw`。常用于在耗时循环里刷新进度。
function flip() end


--[[ 颜色 ]]--
---
--- 设置当前绘图颜色。COL 默认为 light_gray（0xc2c3c7）。
---@param COL? number
---@return number old_col
function color(COL) end

---
--- 设置调色板索引 IDX 的颜色，并返回可传给各绘图函数的颜色值。
---@param idx number
---@param r number
---@param g number
---@param b number
---@param a? number
---@return number color_value
function palrgb(idx, r, g, b, a) end

---
--- 根据 RGB(A) 取颜色值。调色板模式下会查找最接近的调色板颜色。
---@param r number
---@param g number
---@param b number
---@param a? number
---@return number color_value
function getcolor(r, g, b, a) end

---
--- 颜色重映射。P 选择映射表（0 = 绘制调色板，默认；1 = 显示调色板；2 = 辅助调色板）。
--- 不带参数调用重置所有调色板；pal(0) 重置绘制调色板，pal(1) 重置显示调色板。
--- 传表可一次设置多项，例如 pal({[12] = 9, [14] = 8})。
---@param C0? number|table
---@param C1? number
---@param P? number
---@return number old_mapping
function pal(C0, C1, P) end

---
--- 设置颜色透明度。T = true 透明，false 不透明。
--- palt() 恢复默认（只有颜色 0 透明）；只传一个参数时按 16 色位域处理。
---@param C? number
---@param T? boolean
---@return number old_bitfield
function palt(C, T) end

---
--- 设置 4x4 双色填充图案，返回旧图案。fillp(0) 恢复实心填充。
--- 影响 circ、circfill、rect、rectfill、polygonfill、trifill、oval、ovalfill、pset、line、lines。
---@param P number
---@return number old_pattern
function fillp(P) end


--[[ 像素 ]]--
---
--- 把 (X,Y) 处的像素设为 COL；省略 COL 时用当前绘图颜色。
---@param X number
---@param Y number
---@param COL? number
function pset(X, Y, COL) end

---
--- 返回屏幕 (X,Y) 处的像素颜色；越界返回 0。
---@param X number
---@param Y number
---@return number color
function pget(X, Y) end

---
--- 返回精灵表 (X,Y) 处的像素颜色；越界返回 0。
---@param X number
---@param Y number
---@return number color
function sget(X, Y) end

---
--- 把精灵表 (X,Y) 处的像素设为 COL；省略 COL 时用当前绘图颜色。
---@param X number
---@param Y number
---@param COL? number
function sset(X, Y, COL) end


--[[ 图形 ]]--
---
--- 从 (X0,Y0) 到 (X1,Y1) 画线。不给 (X1,Y1) 时沿用上一条线的终点；
--- line() 不带参数则清除这个终点。
---@param X0? number
---@param Y0? number
---@param X1? number
---@param Y1? number
---@param COL? number
function line(X0, Y0, X1, Y1, COL) end

---
--- 按坐标表 COORDS = {x0,y0,x1,y1,...} 画折线。CLOSE = true 时再连回起点。
---@param coords table
---@param COL? number
---@param CLOSE? boolean
function lines(coords, COL, CLOSE) end

---
--- 画一条指定线宽 WIDTH 的线段，从 (X0,Y0) 到 (X1,Y1)。
---@param WIDTH number
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function wline(WIDTH, X0, Y0, X1, Y1, COL) end

---
--- 按坐标表 COORDS 画贝塞尔曲线。
--- 6 个数是二次曲线（3 个控制点），8 个是三次曲线（4 个控制点），最多 63 个数。
--- SEGMENTS 是每段曲线的细分数（默认 2），WIDTH 是线宽（默认 1）。
---@param coords table
---@param segments? number
---@param COL? number
---@param WIDTH? number
function bezier(coords, segments, COL, WIDTH) end

---
--- 画矩形边框，(X0,Y0) 到 (X1,Y1)。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function rect(X0, Y0, X1, Y1, COL) end

---
--- 画填充矩形，(X0,Y0) 到 (X1,Y1)。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function rectfill(X0, Y0, X1, Y1, COL) end

---
--- 用 COL 填充矩形，绕过 pal() 重映射和 fillp() 图案，用于快速清区。
--- camera 和 clip 仍然生效。COL 必填。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function rectcls(X0, Y0, X1, Y1, COL) end

---
--- 画以 (X,Y) 为圆心、R 为半径的圆边框。R < 0 时什么都不画。
---@param X number
---@param Y number
---@param R number
---@param COL? number
function circ(X, Y, R, COL) end

---
--- 画以 (X,Y) 为圆心、R 为半径的填充圆。R < 0 时什么都不画。
---@param X number
---@param Y number
---@param R number
---@param COL? number
function circfill(X, Y, R, COL) end

---
--- 在包围矩形 (X0,Y0)-(X1,Y1) 内画椭圆边框。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function oval(X0, Y0, X1, Y1, COL) end

---
--- 在包围矩形 (X0,Y0)-(X1,Y1) 内画填充椭圆。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL? number
function ovalfill(X0, Y0, X1, Y1, COL) end

---
--- 从 ANGLE1 到 ANGLE2 逆时针画圆弧。角度单位为度，范围 [-180,180]，
--- 0 是 (R,0)，90 是 (0,-R)。
---@param X number
---@param Y number
---@param R number
---@param ANGLE1 number
---@param ANGLE2 number
---@param COL? number
function arc(X, Y, R, ANGLE1, ANGLE2, COL) end

---
--- 按坐标表填充多边形，至少 3 组、最多 64 组点。
---@param polygon table
---@param COL? number
function polygonfill(polygon, COL) end

---
--- 填充三角形。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param X2 number
---@param Y2 number
---@param COL? number
function trifill(X0, Y0, X1, Y1, X2, Y2, COL) end


--[[ 精灵 ]]--
---
--- 在 (X,Y) 绘制精灵 N。W,H 是以 8x8 精灵块为单位的尺寸（默认 1,1）。
--- 颜色 0 默认透明（见 palt()）。
---@param N number
---@param X number
---@param Y number
---@param W? number
---@param H? number
---@param FLIP_X? boolean
---@param FLIP_Y? boolean
function spr(N, X, Y, W, H, FLIP_X, FLIP_Y) end

---
--- 把精灵表的矩形 (SX,SY,SW,SH) 拉伸到屏幕矩形 (DX,DY,DW,DH)。DW,DH 默认等于 SW,SH。
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
--- 类似 sspr()，但支持旋转和缩放。ANGLE 单位为度。
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
--- 从 (X0,Y0) 到 (X1,Y1) 画纹理线，纹理由精灵表 (SPRX,SPRY) 处采样。
--- SPRDX,SPRDY 是采样增量（默认 1/8, 0）。
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
--- 返回精灵 N 的标志。F 是标志位序号 0..7，返回布尔值；省略 F 返回整个位域。
---@param N number
---@param F? number
---@return boolean|number value
function fget(N, F) end

---
--- 设置精灵 N 的标志。给 F 时把该位设为 VAL（布尔值）；不给 F 时 VAL 作为整个位域。
---@param N number
---@param F? number|boolean
---@param VAL? number|boolean
function fset(N, F, VAL) end


--[[ 图像块 ]]--
---
--- 在 (X,Y) 绘制原始图像数据块。
--- OPFLAG：bit0 = alpha 混合绘制（仅 32bpp），bit1-2 = X 锚点（0 左、1 右、2 居中），
--- bit3-4 = Y 锚点（0 上、1 下、2 居中）。
--- DATA 传 "SPR"（直接用精灵表）或 "SCR"（直接用屏幕）时忽略 LINEBYTES,W,H,BPP。
--- FLAG：bit0 = 预乘 alpha，bit1 = 交换蓝红通道，bit2 = 不透明。
--- SX,SY,SW,SH 选择要绘制的源矩形。
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


--[[ 二维码 ]]--
---
--- 在 (x,y)-(x+w,y+w) 内绘制 STR 的二维码。背景需要先自行填充：本函数只画有效点。
--- 返回码的像素宽度（放不下或 W 太小时返回 0）。
---@param str string
---@param col? number
---@param w? number
---@param x? number
---@param y? number
---@return number raw_width
function qrcode(str, col, w, x, y) end
