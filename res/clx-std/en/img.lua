---@meta

--[[
  CLX 图像模块（img）。

  img_* 系列在卡带启动时即已注册，不需要 usemod。每个加载函数返回图像对象
  （userdata），用完调用 img_close() 释放，或者交给 GC。
]]

---
--- @class img
---
--- Image object. Holds the pixel data and the related resources.
local img = {}

--[[ 图像标志共有位 ]]--
--- 预乘 alpha
IMG_FLAG_PREMUL = 0x01
--- 绘制时不透明（跳过 alpha 混合）
IMG_FLAG_OPAQUE = 0x04
--- 绘制时跳过清屏
IMG_FLAG_NOCLS = 0x08

--[[ opflag 位 ]]--
--- bit0 = alpha 混合绘制（仅 32bpp 源有效）
IMG_OP_ALPHA = 0x01
--- bit1-2 = X 方向锚点：0 左、1 右、2 居中
IMG_OP_ANCHOR_X_MASK = 0x06
--- bit3-4 = Y 方向锚点：0 上、1 下、2 居中
IMG_OP_ANCHOR_Y_MASK = 0x18


--[[ 加载 ]]--
---
--- Loads PNG/JPG/GIF/WebP data into an image object. Returns nil on failure.
--- BPP (1/4/8/16/32) converts the image; omitted uses the platform depth. WebP needs 16 or 32.
--- FLAG holds image attributes (bit0 premultiplied, bit1 swap blue/red, bit2 opaque).
--- GIFALL = true loads every GIF frame stacked vertically into one image (width unchanged,
--- height = frame height x frame count); only the first frame is loaded by default.
--- Loading all frames costs a lot of memory: calculate the footprint first.
---@param picdata string
---@param bpp? number
---@param flag? number
---@param gifall? boolean
---@return img|nil
function img_load(picdata, bpp, flag, gifall) end

---
--- Wraps a sub-region of screen VRAM ("SCR") or the sprite bank ("SPR") as an img object
--- without copying: the object points straight at VM memory, so img_close()/GC never frees it
--- and its contents follow the live screen/sprite sheet. BPP and geometry follow the current spec.
--- Negative or out-of-range SX,SY return nil; oversized SW,SH are clipped; SW,SH <= 0 return nil.
---@param src "SCR"|"SPR"
---@param sx number
---@param sy number
---@param sw number
---@param sh number
---@param flag? number
---@return img|nil
function img_loadscr(src, sx, sy, sw, sh, flag) end

---
--- Loads WebP data with optional crop and downscale. Returns the image object and the full
--- (uncropped, unscaled) width and height. Only BPP 16 and 32 are supported.
--- OPT: bit0 = load a crop area, bit1 = scale down. CX,CY,CW,CH is the crop rectangle,
--- SW,SH the scaled size.
---@param picdata string
---@param bpp? number
---@param flag? number
---@param opt? number
---@param cx? number
---@param cy? number
---@param cw? number
---@param ch? number
---@param sw? number
---@param sh? number
---@return img|nil
---@return number fullwidth
---@return number fullheight
function img_loadwebp(picdata, bpp, flag, opt, cx, cy, cw, ch, sw, sh) end

---
--- Loads a GIF animation with streaming decode: frames are rendered on demand to save memory.
--- The frame index advances with img_gif_next() and the frame is drawn with img_drawgif().
---@param picdata string
---@param bpp? number
---@return img|nil
function img_gif_load(picdata, bpp) end

---
--- Same as img_gif_load() but reads the GIF from a file.
---@param filename string
---@param bpp? number
---@return img|nil
function img_gif_file(filename, bpp) end

---
--- Advances a streaming GIF to the next frame. Returns nil when no update is needed,
--- 1 when the image was updated and 0 when the animation has ended.
---@param img img
---@param force? boolean
---@return number|nil has_next
---@return number delay_ms
function img_gif_next(img, force) end

---
--- Loads a WebP animation. Frames advance with img_webpani_next(); the decode canvas is
--- always 32bpp. Returns the image object and the frame count.
---@param picdata string
---@param bpp? number
---@param flag? number
---@return img|nil
---@return number frame_count
function img_webpani_load(picdata, bpp, flag) end

---
--- Advances a streaming WebP animation to the next frame. Same returns as img_gif_next().
---@param img img
---@param force? boolean
---@return number|nil has_next
---@return number delay_ms
function img_webpani_next(img, force) end

---
--- Rewinds a WebP animation to the first frame.
---@param img img
function img_webpani_reset(img) end

---
--- Pushes the palette of the current GIF frame into VM memory (only effective in 4/8bpp).
---@param img img
---@param maxcnt? number
---@return number count
function img_gif_palrefresh(img, maxcnt) end


--[[ 空中图流 ]]--
-- 只有带「空中图流」帧提供方的固件才注册这三个函数；其他平台（含桌面 host）
-- 下它们是 nil，调用前用 `if img_scrair then` 探测。
---
--- Probes the newest air-stream frame without decoding it. Returns the frame size,
--- the sender-assigned FRAME_ID (increments and wraps; a change means a new frame),
--- the encoded JPG length and AGE_MS, the milliseconds elapsed since the frame arrived.
--- AGE_MS is what tells you the sender stopped: the last frame stays available forever.
--- Returns nil when no frame is available.
---@return number|nil w
---@return number h
---@return number frame_id
---@return number jpg_len
---@return number age_ms
function img_airinfo() end

---
--- Decodes the newest air-stream frame into an image object owned by the caller
--- (release with img_close() or GC). BPP defaults to the spec depth. nil when there is no
--- frame or decoding fails.
---@param bpp? number
---@param flag? number
---@return img|nil
function img_loadair(bpp, flag) end

---
--- Decodes the newest air-stream frame straight into screen VRAM. X,Y,FLAG use the same
--- anchor semantics as img_draw() and default to centered (flag 0x14). Never scales:
--- an oversized frame falls back to a centered cropped blit. Cheap enough to call every frame.
---@param x? number
---@param y? number
---@param flag? number
---@return boolean ok
function img_scrair(x, y, flag) end


--[[ 操作 ]]--
---
--- Sets image attributes and returns the resulting flag value.
--- OP is '+' to add, '-' to remove, '=' to assign FLAG outright.
---@param img img
---@param op "+"|"-"|"="
---@param flag number
---@return number flag
function img_set_flag(img, op, flag) end

---
--- Returns the image dimensions and attributes.
--- For animated images it also returns FRAME_H (frame height) and DELAYS, the array of
--- per-frame display times in milliseconds.
---@param img img
---@return number w
---@return number h
---@return number bpp
---@return number flag
---@return number|nil frame_h
---@return table|nil delays
function img_info(img) end

---
--- Releases the image resources immediately. For img_loadscr() objects this only drops the
--- wrapper: the borrowed VM memory is untouched.
---@param img img
function img_close(img) end


--[[ 绘制 ]]--
---
--- Draws the image at (X,Y). OPFLAG uses the blit anchor and blend bits.
---@param img img
---@param x number
---@param y number
---@param opflag? number
function img_draw(img, x, y, opflag) end

---
--- Draws the (SX,SY,SW,SH) region of the image at (X,Y).
---@param img img
---@param x number
---@param y number
---@param opflag? number
---@param sx? number
---@param sy? number
---@param sw? number
---@param sh? number
function img_drawex(img, x, y, opflag, sx, sy, sw, sh) end

---
--- Draws the image rotated by ANGLE degrees and scaled by ZOOMX,ZOOMY.
--- OPFLAG is reserved and currently ignored. SX..SH must lie inside the image, and the
--- source bpp must match the canvas (16<->32 and palette 8bpp -> 16/32 convert, everything
--- else draws nothing).
---@param img img
---@param dx number
---@param dy number
---@param opflag? number
---@param sx? number
---@param sy? number
---@param sw? number
---@param sh? number
---@param angle? number
---@param zoomx? number
---@param zoomy? number
function img_drawrot(img, dx, dy, opflag, sx, sy, sw, sh, angle, zoomx, zoomy) end

---
--- Scales the image to DW,DH at (DX,DY). OPFLAG bit8 mirrors X, bit9 mirrors Y.
--- A source rectangle outside the image draws nothing.
---@param img img
---@param dx number
---@param dy number
---@param dw number
---@param dh number
---@param sx? number
---@param sy? number
---@param sw? number
---@param sh? number
---@param opflag? number
function img_drawzoom(img, dx, dy, dw, dh, sx, sy, sw, sh, opflag) end

---
--- Draws frame FRAMEIDX of an all-frames GIF loaded with img_load(..., true).
--- Returns the next frame index and its delay in milliseconds.
---@param img img
---@param frameidx number
---@param x number
---@param y number
---@param opflag? number
---@param sx? number
---@param sy? number
---@param sw? number
---@param sh? number
---@return number next_frameidx
---@return number delay_ms
function img_drawgif(img, frameidx, x, y, opflag, sx, sy, sw, sh) end
