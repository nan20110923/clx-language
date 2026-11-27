---@meta

--[[
  CLX 文字输出与字体（对应官方文档 text.md）。

  print 是屏幕绘制（不是控制台的 print）：控制台输出用 printh。
]]

---
--- 在屏幕上输出文字。
--- 简式：print(STR [, COL]) 在当前光标处用当前颜色打印。
--- 全式：print(STR, X, Y [, COL [, OPT [, SIZE [, FONT]]]]) 在 X,Y 处打印。
--- OPT：bit0 = 坐标下对齐，bit1-2 = 对齐方式（1 右、2 居中、3 只测宽不绘制，
--- print 不支持 3），bit7 = 打印后不换行，bit8-15 = 字间距（有符号）。
--- SIZE：位图字体 8（8x8）或 16（8x16），其他值按 4x6 渲染；中文 16x16（部分固件 24x24）。
--- 返回打印后的光标 x 坐标，可当作文本宽度。
---@param STR string
---@param X? number
---@param Y? number
---@param COL? number
---@param OPT? number
---@param SIZE? number
---@param FONT? string
---@return number new_x
function print(STR, X, Y, COL, OPT, SIZE, FONT) end

---
--- 主机相关文字输出，支持任意字体与任意大小。
--- FONT 名称："ascii"、"mascii"、"wascii"、"DIN_NATURE_Bold"、"gp"、"dig"、"vampire"、
--- "default"（支持中日韩文，ColoPLAY 上没有，且必须显式传名字），或 font_add() 注册的名字。
--- 本函数不支持 print 的转义序列。
--- 返回文本宽度；OPT bit1-2 = 3 时只测宽不绘制。
---@param STR string
---@param X number
---@param Y number
---@param COL number
---@param OPT number
---@param SIZE number
---@param FONT string
---@return number width
function drawTxt_h(STR, X, Y, COL, OPT, SIZE, FONT) end

---
--- 设置文字光标位置；给了 COL 时同时设置当前颜色。
---@param X number
---@param Y number
---@param COL? number
---@return number old_x
---@return number old_y
---@return number old_col
function cursor(X, Y, COL) end

---
--- 加载自定义 TrueType 字体，返回字体对象。
--- NAME 是之后传给 print/drawTxt_h 的名字。SIZE 传 0 表示矢量字体（由使用时指定大小）。
--- TTFDATA 是字体文件内容，CACHE 是字形缓存数量（nil 用默认值），RBNAME 是缺字时的回退字体。
--- 返回的对象必须保持引用：被 GC 回收时字体会一起释放。
--- TTF 文件很大，嵌入前先裁剪成实际用到的字符。
---@param name string
---@param size number
---@param ttfdata string
---@param cache? number
---@param rbname? string
---@return table font_object
function font_add(name, size, ttfdata, cache, rbname) end

---
--- 移除 font_add() 注册的字体。
---@param font table
function font_close(font) end

---
--- 清理字体缓存以释放内存。GLOBAL = true 清理自定义和全局字体缓存，false 只清自定义的。
--- 用大字体渲染之后值得调用一次。
---@param global? boolean
function font_shrink(global) end

---
--- 把 GB2312 编码的字符串转成 UTF-8。print 和 drawTxt_h 只支持 UTF-8。
---@param str_gb string
---@return string str_utf8
function gb2312_to_utf8(str_gb) end
