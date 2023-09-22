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
-- ---
-- --- Set the clipping rectangle in pixels. All drawing operations will be clipped to a rectangle at x,y and width w,h.
-- --- clip() to reset.
-- --- When CLIP_PREVIOUS is true, clip the new clipping region with the old clipping region.
-- ---@param X number
-- ---@param Y number
-- ---@param W number
-- ---@param H number
-- ---@param CLIP_PREVIOUS boolean
-- function clip(X, Y, W, H, CLIP_PREVIOUS) end

-- ---
-- --- Set the pixel at x, y to a specific color.
-- --- If COL is not specified, the current drawing color is used.
-- ---@param X number
-- ---@param Y number
-- ---@param COL number
-- function pset(X, Y, COL) end

-- ---
-- --- Get the color of the pixel at (X, Y) on the screen.
-- --- PS: pget returns 0 when X and Y are out of range.
-- ---@param X number
-- ---@param Y number
-- function pget(X, Y) end

-- ---
-- --- Set the color (COL) of a sprite sheet pixel.
-- ---@param X number
-- ---@param Y number
-- ---@param COL number
-- function sset(X, Y, COL) end

-- ---
-- --- Get the color (COL) of a sprite sheet pixel.
-- --- PS: sget returns 0 when X and Y are out of range.
-- ---@param X number
-- ---@param Y number
-- function sget(X, Y) end


-- ---
-- --- Set the value (VAL) of the flag F of sprite N.
-- --- F is the flag index 0..7.
-- --- VAL is TRUE or FALSE.
-- --- The initial state of flags 0..7 can be set in the sprite editor and thus can be used to create custom sprite properties.
-- --- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
-- --- When F is omitted, all flags are retrieved/set as a single bitfield.
-- ---@param N number
-- ---@param F number
-- ---@param VAL boolean
-- function fset(N, F, VAL) end

-- ---
-- --- Get the value (VAL) of the flag F of sprite N.
-- --- F is the flag index 0..7.
-- --- VAL is TRUE or FALSE.
-- --- The initial state of flags 0..7 can be set in the sprite editor and thus can be used to create custom sprite properties.
-- --- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
-- --- When F is omitted, all flags are retrieved/set as a single bitfield.
-- ---@param N number
-- ---@param F number
-- function fget(X, Y) end

-- ---
-- --- Convert codepage from gb2312 to utf8 print/drawTxt_h only support utf8
-- ---@param gb2312 string
-- ---@return string
-- function gb2312_to_utf8(gb2312) end


-- ---
-- --- Convert codepage from gb2312 to utf8 print/drawTxt_h only support utf8
-- ---@param gb2312 string
-- ---@return string
-- function gb2312_to_utf8(gb2312) end


---
--- 以像素为单位设置剪切矩形。 所有绘图操作将被裁剪到 x, y 处宽度和高度为 w,h 的矩形。
--- clip() 进行重置。
--- 当 CLIP_PREVIOUS 为 true 时，用旧的裁剪区域裁剪新的裁剪区域。
---@param Y number
---@param X number
---@param W number
---@param H number
---@param CLIP_PREVIOUS boolean
function clip(X, Y, W, H, CLIP_PREVIOUS) end


---
--- 将屏幕上 (X, Y) 处的像素设置为特定颜色。
--- 如果未指定 COL，则使用当前绘制颜色。
---@param X number
---@param Y number
---@param COL number
function pset(X, Y, COL) end

---
--- 返回屏幕上 (X, Y) 处像素的颜色。
--- 当 X 和 Y 超出范围时，pget 返回 0。
---@param X number
---@param Y number
function pget(X, Y) end

---
--- 设置精灵表像素的颜色 (COL)。
---@param X number
---@param Y number
---@param COL number
function sset(X, Y, COL) end

---
--- 获取精灵表像素的颜色 (COL)。
--- 当 X 和 Y 超出范围时，sget 返回 0。
---@param X number
---@param Y number
function sget(X, Y) end


---
--- 设置精灵 N 的标志 F 的值（VAL）。
--- F 是标志索引 0..7。
--- VAL 为 TRUE 或者 FALSE。
--- 标志 0..7 的初始状态可在精灵编辑器中设置，因此可用于创建自定义精灵属性。 也可以通过在 MAP() 中提供掩码来仅绘制地图图块的子集。
--- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
--- 当省略 F 时，所有标志都被设置为单个位域。
---@param N number
---@param F number
---@param VAL boolean
function fset(N, F, VAL) end

---
--- 获取精灵 N 的标志 F 的值（VAL）。
--- F 是标志索引 0..7。
--- 标志 0..7 的初始状态可在精灵编辑器中设置，因此可用于创建自定义精灵属性。 也可以通过在 MAP() 中提供掩码来仅绘制地图图块的子集。
--- It is also possible to draw only a subset of map tiles by providing a mask in MAP().
--- 当省略 F 时，所有标志都被检索为单个位域。
---@param N number
---@param F number
function fget(N, F) end

---
--- 把gb2312编码的字符串转换为utf8编码
---@param gb2312 string
---@return string
function gb2312_to_utf8(gb2312) end



---
--- print 是设备无关的打印接口。
--- print 支持STR内部的特殊转义，只支持utf8编码
--- OPT 是打印选项：
---   bit0:    坐标下对齐
---   bit1-2:  对齐方式，1表示右对齐，2表示做中对齐，3表示不绘制(返回宽度) ，注意print不支持，drawTxt_h生效
---   bit7:    打印后不换行
---   bit8-15: 字间距
--- SIZE 是字体大小，如果是不支持的size，就会使用默认大小。
--- FONT 是字体名，如果不支持会使用默认。
---@param STR string
---@param X number
---@param Y number
---@param COL number
---@param OPT number
---@param FONT number
function print(STR, X, Y, COL, OPT, SIZE, FONT) end


---
--- drawTxt_h 是依赖主机类型的打印接口，不同的主机上效果不同。
--- OPT 是打印选项：
---   bit0:    坐标下对齐
---   bit1-2:  对齐方式，1表示右对齐，2表示做中对齐，3表示不绘制(返回宽度) ，注意print不支持，drawTxt_h生效
---   bit7:    打印后不换行
---   bit8-15: 字间距
--- SIZE 是字体大小，如果是不支持的size，就会使用默认大小。
--- FONT 是字体名，如果不支持会使用默认。
---@param STR string
function drawTxt_h(STR) end


---
--- 设置光标位置。
--- 如果指定了 COL，还要设置当前颜色。
---@param X number
---@param Y number
---@param COL number
function cursor(X, Y, COL) end


---
--- 设置绘图函数使用的当前颜色。
--- 如果未指定 COL，则当前颜色设置为 light_gray(rgb=#c2c3c7)。
---@param COL number
function color(COL) end


---
--- 清除屏幕并重置剪辑矩形和打印状态。
--- COL 默认为 0（黑色）。
---@param COL number
function cls(COL) end


---
--- 为所有绘图操作设置 -x, -y 的屏幕偏移。
--- camera() 恢复默认状态。
---@param X number
---@param Y number
function camera(X, Y) end

---
--- 画圆弧, 逆时针从angle1画到angle2 angle 需要在范围内[-180,180], 0 是点[R,0], 90是点[0,-R]
---@param X number
---@param Y number
---@param R number
---@param ANGLE1 number
---@param ANGLE2 number
---@param COL number
function arc(X, Y, R, ANGLE1, ANGLE2, COL) end

---
--- 以 (X，Y) 为中心点 绘制一个半径为 R 的圆。
--- 如果 R 为负，则不绘制圆。
---@param X number
---@param Y number
---@param R number
---@param COL number
function circ(X, Y, R, COL) end


---
--- 以 (X，Y) 为中心点 绘制一个半径为 R 的实心圆。
--- 如果 R 为负，则不绘制圆。
---@param X number
---@param Y number
---@param R number
---@param COL number
function circfill(X, Y, R, COL) end


---
--- 使用给定的边界矩形绘制一个在 x 和 y 上对称的椭圆。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function oval(X0, Y0, X1, Y1, COL) end


---
--- 使用给定的边界矩形绘制一个在 x 和 y 上对称的实心椭圆。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function ovalfill(X0, Y0, X1, Y1, COL) end

---
--- 从 (X0, Y0) 到 (X1, Y1) 画一条线。
--- 如果未给出 (X1, Y1)，则使用最后绘制的线的末端。
--- 没有参数的 line() 意味着下一次调用 line(X1, Y1) 将只设置终点而不绘制。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function line(X0, Y0, X1, Y1, COL) end


---
--- 根据表里面的坐标，画线段。
--- CLOSE表示封闭线段(会连线到x0,y0)。
--- lineTbl: {x0, y0, x1, y1, ...}
---@param lineTbl table
---@param COL number
---@param CLOSE boolean
function lines(lineTbl, COL, CLOSE) end

---
--- 在 (X0, Y0), (X1, Y1) 处绘制一个矩形
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function rect(X0, Y0, X1, Y1, COL) end

---
--- 在 (X0, Y0), (X1, Y1) 处绘制一个填充矩形
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param COL number
function rectfill(X0, Y0, X1, Y1, COL) end

---
--- 根据表里面的坐标，进行多边形填充，注意表里面至少需要3组点，最多64组点。
--- polygon: {x0, y0, x1, y1, ...}
---@param polygon table
---@param COL number
function polygonfill(polygon, COL) end


---
--- 三角形填充。
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param X2 number
---@param Y2 number
---@param COL number
function trifill(X0,Y0,X1,Y1,X2,Y2,COL) end


---
--- 将颜色 C0 替换为 C1，用于三个调色板重新映射之一（P 默认为 0）：
--- 0：绘制调色板
--- 1：显示调色板
--- 2：二级调色板
---@param C0 number
---@param C1 number
---@param P number
function pal(C0, C1, P) end


---
--- 将颜色索引的透明度设置为 T（布尔值） 通过 spr()、sspr()、map() 和 tline() 实现绘制透明：
--- palt() 重置为默认值：除了颜色 0 之外的所有颜色都是不透明的
--- 当 C 是唯一的参数时，它被视为用于设置所有 16 个值的位域。 例如：将颜色 0 和 1 设置为透明：
---@param C number
---@param T boolean
function palt(C, T) end


---
--- 在位置 X,Y 绘制精灵 N (0..n)。
--- W（width）和H（height）都是1，默认为1，表示多少个精灵块。
--- 颜色 0 默认绘制为透明（请参阅 palt() ）。
--- 当 FLIP_X 为 true 时，水平翻转。
--- 当 FLIP_Y 为 true 时，垂直翻转。
---@param N number
---@param X number
---@param Y number
---@param W number
---@param H number
---@param FLIP_X boolean
---@param FLIP_Y boolean
function spr(N, X, Y, W, H, FLIP_X, FLIP_Y) end

---
--- 将精灵图像的矩形 (sx, sy, sw, sh) 拉伸到屏幕上的目标矩形 (sx, sy, dw, dh)。
--- 在这两种情况下，x 和 y 值都是矩形左上角的坐标（以像素为单位），宽度为 w、h。
--- 颜色 0 默认绘制为透明，参见 palt()。
--- dw、dh默认为sw、sh。
--- 当 FLIP_X 为 true 时，水平翻转。
--- 当 FLIP_Y 为 true 时，垂直翻转。
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
--- 从(X0,Y0)到(X1,Y1)画一条纹理线，纹理数据从map的MX,MY获取
--- MDX: 纹理数据X方向的增量,默认1/8
--- MDY: 纹理数据Y方向的增量,默认0
--- statctl(tlmw/tlmh/tlmx/tlmy) 可以控制纹理映射方式
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
--- 从(X0,Y0)到(X1,Y1)画一条纹理线，纹理数据从Sprite的SPRX,SPRY获取。
--- SPRDX: 纹理数据X方向的增量，默认1/8
--- SPRDY: 纹理数据Y方向的增量，默认0
--- statctl(tlmw/tlmh) 可以控制纹理映射方式
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
--- 程序填充图案是一个 4x4 2 色平铺图案，影响以下的绘图函数：
--- circ, circfill, rect, rectfill, polygonfill, trifill, oval, ovalFill, pset, line, lines
--- P 是从最高位开始读取顺序的位域。 要计算所需模式的 P 值，请将位值加在一起
---@param P number
function fillp(P) end

---
--- 绘制图像数据块
--- x,y 绘制的左上角坐标
--- opflag 绘制策略:
---   bit0 1 表示alpha混合绘制(只有32位颜色模式有效)
---   bit1-2 表示x方向的锚点 0:左,1:右,2:中间
---   bit3-4 表示y方向的锚点 0:上,1:下,2:中间
--- data 图像数据，data可以是特殊数据,此时linebytes,w,h,bpp忽略::
---   "SPR" 表示直接使用sfx图像
---   "SCR" 表示直接使用屏幕
--- linebytes 每行数据长度
--- w,h,bpp 图像宽高和每像素位数
--- flag 图像数据属性：
---   bit0 premul数据(32位颜色，预乘alpha)
---   bit1 swap_br (需要交换blue/red数据)
---   bit2 OPAQUE(不透明，禁用alpha)
--- sx,sy,sw,sh 选取要绘制的图像矩形
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
--- 类似sspr，但是支持旋转角度和缩放。
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
--- 设置调色板颜色，并返回颜色值(此颜色值可以用来作为COL给其他绘图函数使用)。
---@param idx number
---@param r number
---@param g number
---@param b number
---@return number
function palrgb(idx,r,g,b,a) end

---
--- 返回可用于绘图函数的颜色值。
--- 注意，对于调色板模式，会查找最相近的调色板颜色。
---@param r number
---@param g number
---@param b number
---@param a number
---@return number
function getcolor(r,g,b,a) end


--- 加载图片数据(png/jpg格式)，如果提供了bpp参数，会转换为对应的图像格式，否则安装系统规格转换。
--- 支持加载gif图片(version>=6)
---   默认只加载首帧
---   通过参数gifall可以加载所有帧:gif=img_gif_load(gifdata,nil,nil,true)
---   多帧会按照Y方向拼接为一个图像
---   注意加载所有帧图片会大量消耗内存,尽量避免,计算好内存用量
--- 返回图像对象img。
---@param picdata string
---@param bpp number
---@param flag number
---@param gifall any
---@return table
function img_load(picdata,bpp,flag,gifall) end


---
--- 立即释放img资源。
---@param img table
function img_close(img) end


---
--- 返回图像的w,h,bpp,flag。
--- 如果是gif,返回 w,h,bpp,flag,frame_h,delays
---   frame_h: 帧高度
---   delays: 数组,存放每帧演示时间(ms)
---@param img table
function img_info(img) end

---
--- 粘贴图像到x,y位置，flag参考blit的参数。
---@param img table
---@param x number
---@param y number
---@param flag number
function img_draw(img,x,y,flag) end


---
--- 粘贴图像的特定区域到x,y位置，flag参考blit的参数。
---@param img table
---@param x number
---@param y number
---@param flag number
---@param sx number
---@param sy number
---@param sw number
---@param sh number
function img_drawex(img,x,y,flag,sx,sy,sw,sh) end


---
--- 粘贴gif图像帧的特定区域到x,y位置，flag参考blit的参数。 返回: 当前帧号,需要的延时时间
---@param img table
---@param frameidx number
---@param x number
---@param y number
---@param flag number
---@param sx number
---@param sy number
---@param sw number
---@param sh number
function img_drawgif(img,frameidx,x,y,flag,sx,sy,sw,sh) end


---
--- 加载gif图片数据，如果提供了bpp参数，会转换为对应的图像格式，否则安装系统规格转换。
--- 函数会动态渲染需要的帧, 节省内存
--- 返回图像对象img。
---@param picdata string
---@param bpp number
---@return table
function img_gif_load(picdata,bpp) end


---
--- 加载gif文件，如果提供了bpp参数，会转换为对应的图像格式，否则安装系统规格转换。
--- 函数会动态渲染需要的帧, 节省内存
--- 返回图像对象img。
---@param filename string
---@param bpp number
---@return table
function img_gif_file(filename,bpp) end

---
--- 根据需要更新帧图像
--- 返回nil表示没有更新 返回整数0表示gif动画结束,1表示更新图像了
---@param img table
---@return any
function img_gif_next(img) end


---
--- 加载rlottie动画数据，key是id(相同id的cont必须相同)，w/h是渲染大小，返回动画对象ani。
---@param key any
---@param cont any
---@param w number
---@param h number
---@return table
function rlottie_load(key,cont,w,h) end

---
--- 立即释放ani资源。
---@param ani table
function rlottie_close(ani) end

---
--- 获取rlottie对象信息
--- 返回 当前帧，总帧数，动画帧速，图像宽，图像高。
---@param ani table
---@return number, number, number, number, number
function rlottie_info(ani) end

---
--- 绘制动画的特定帧到x,y位置。
---@param ani table
---@param frameidx number
---@param x number
---@param y number
function rlottie_draw(ani,frameidx,x,y) end


---
--- 设定动画路径上的属性参数。
---@param ani table
---@param proptype any
---@param keypath any
---@param v1 any
---@param v2 any
---@param v3 any
function rlottie_prop(ani,proptype,keypath,v1,v2,v3) end


---
--- 以表格方式返回动画区段 {{name,frm_begin,frm_end},...}
---@param ani table
function rlottie_mark(ani) end

