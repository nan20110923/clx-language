---@meta

--[[
  CLX 文字输出与字体。

  与官方文档 text.md 对应。print 是设备无关的屏幕输出（不是控制台的 print）：
  控制台输出请用 printh（见 clx-lua/globals.lua）。
]]

---
--- Outputs text on the screen.
--- Simple form: print(STR [, COL]) draws at the cursor with the current color.
--- Full form: print(STR, X, Y [, COL [, OPT [, SIZE [, FONT]]]]) draws at X,Y.
--- OPT: bit0 = bottom alignment, bit1-2 = alignment (1 right, 2 center, 3 measure only,
--- not supported by print), bit7 = no line break, bit8-15 = letter spacing (signed).
--- SIZE: 8 (8x8) or 16 (8x16) for the bitmap font, anything else is drawn 4x6;
--- Chinese is 16x16 (24x24 on some firmwares).
--- Returns the cursor x position after printing, usable as the text width.
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
--- Host-dependent text output. Supports every TTF font at any size.
--- FONT names: "ascii", "mascii", "wascii", "DIN_NATURE_Bold", "gp", "dig", "vampire",
--- "default" (CJK; not available on ColoPLAY, and it must be named explicitly),
--- or a name registered with font_add().
--- Escape sequences are not supported here.
--- Returns the text width; with OPT bit1-2 = 3 it only measures and draws nothing.
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
--- Sets the text cursor position and, when COL is given, the current color.
---@param X number
---@param Y number
---@param COL? number
---@return number old_x
---@return number old_y
---@return number old_col
function cursor(X, Y, COL) end

---
--- Loads a custom TrueType font and returns the font object.
--- NAME is what later gets passed to print/drawTxt_h. SIZE 0 means a vector font whose
--- size is chosen at draw time. TTFDATA is the font file contents, CACHE the glyph cache
--- size (nil for the default), RBNAME the fallback font name when a glyph is missing.--- Keep the returned object referenced: the font is freed when it is garbage collected.
--- TTF files are large, so cut them down to the glyphs you use before embedding.
---@param name string
---@param size number
---@param ttfdata string
---@param cache? number
---@param rbname? string
---@return table font_object
function font_add(name, size, ttfdata, cache, rbname) end

---
--- Removes a font registered with font_add().
---@param font table
function font_close(font) end

---
--- Frees cached glyphs to reclaim memory. GLOBAL = true clears the custom and the global
--- caches, false only the custom ones. Worth calling after rendering with large fonts.
---@param global? boolean
function font_shrink(global) end

---
--- Converts a GB2312 encoded string to UTF-8. print and drawTxt_h only accept UTF-8.
---@param str_gb string
---@return string str_utf8
function gb2312_to_utf8(str_gb) end
