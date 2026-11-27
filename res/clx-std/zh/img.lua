---@meta

--[[
  CLX 图像模块（img）。

  img_* 系列在卡带启动时即已注册，不需要 usemod。每个加载函数返回图像对象
  （userdata），用完调用 img_close() 释放，或者交给 GC。
]]

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

---
--- 图像对象，持有像素数据与相关资源。
---@class img
local img = {}


--[[ 加载 ]]--
---
--- 加载 PNG/JPG/GIF/WebP 数据为图像对象，失败返回 nil。
--- BPP（1/4/8/16/32）指定目标色深，省略则用平台规格色深；WebP 只支持 16 或 32。
--- FLAG 是图像属性位（bit0 预乘、bit1 交换蓝红、bit2 不透明）。
--- GIFALL = true 会把 GIF 所有帧按 Y 方向拼成一张大图（宽不变，高 = 单帧高 × 帧数），
--- 默认只加载第一帧。加载全部帧很耗内存，先算一下占用。
---@param picdata string
---@param bpp? number
---@param flag? number
---@param gifall? boolean
---@return img|nil
function img_load(picdata, bpp, flag, gifall) end

---
--- 把屏幕 VRAM（"SCR"）或精灵 bank（"SPR"）的一个子区域零拷贝包装成 img 对象：
--- 对象直接指向 VM 内存，所以 img_close()/GC 不会释放它，内容随屏幕/精灵实时变化。
--- BPP 与几何跟随当前 spec。SX,SY 为负或超出范围返回 nil；SW,SH 溢出会被裁剪；
--- SW,SH <= 0 返回 nil。
---@param src "SCR"|"SPR"
---@param sx number
---@param sy number
---@param sw number
---@param sh number
---@param flag? number
---@return img|nil
function img_loadscr(src, sx, sy, sw, sh, flag) end

---
--- 加载 WebP 数据，可裁剪与缩小。返回图像对象以及原始（未裁剪、未缩放）宽高。
--- 只支持 BPP 16 和 32。
--- OPT：bit0 = 使用裁剪区域，bit1 = 缩小。CX,CY,CW,CH 是裁剪矩形，SW,SH 是缩小后的尺寸。
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
--- 以流式解码加载 GIF 动画：按需渲染帧以省内存。帧序号由 img_gif_next() 推进，
--- 由 img_drawgif() 绘制。
---@param picdata string
---@param bpp? number
---@return img|nil
function img_gif_load(picdata, bpp) end

---
--- 同 img_gif_load()，但从文件读取 GIF。
---@param filename string
---@param bpp? number
---@return img|nil
function img_gif_file(filename, bpp) end

---
--- 流式 GIF 前进到下一帧。无需更新时返回 nil，图像已更新返回 1，动画结束返回 0。
---@param img img
---@param force? boolean
---@return number|nil has_next
---@return number delay_ms
function img_gif_next(img, force) end

---
--- 加载 WebP 动画。帧由 img_webpani_next() 推进；解码画布恒为 32bpp。
--- 返回图像对象与帧数。
---@param picdata string
---@param bpp? number
---@param flag? number
---@return img|nil
---@return number frame_count
function img_webpani_load(picdata, bpp, flag) end

---
--- 流式 WebP 动画前进到下一帧。返回值与 img_gif_next() 相同。
---@param img img
---@param force? boolean
---@return number|nil has_next
---@return number delay_ms
function img_webpani_next(img, force) end

---
--- 把 WebP 动画重置到第一帧。
---@param img img
function img_webpani_reset(img) end

---
--- 把当前 GIF 帧的调色板刷进 VM 内存（仅 4/8bpp 生效）。
---@param img img
---@param maxcnt? number
---@return number count
function img_gif_palrefresh(img, maxcnt) end


--[[ 空中图流 ]]--
-- 只有带「空中图流」帧提供方的固件才注册这三个函数；其他平台（含桌面 host）
-- 下它们是 nil，调用前用 `if img_scrair then` 探测。
---
--- 探测最新一帧的元信息，不解码。返回帧宽高、发送端递增的 FRAME_ID（回绕，值变化即新帧）、
--- 编码后的 JPG 长度，以及 AGE_MS —— 该帧收到距今的毫秒数，判断「发送方是否还在发」只能靠它，
--- 因为最后一帧会一直保留。无可用帧返回 nil。
---@return number|nil w
---@return number h
---@return number frame_id
---@return number jpg_len
---@return number age_ms
function img_airinfo() end

---
--- 把最新一帧解码成调用方自有的图像对象（用 img_close() 或 GC 释放）。
--- BPP 默认 spec 色深。无帧或解码失败返回 nil。
---@param bpp? number
---@param flag? number
---@return img|nil
function img_loadair(bpp, flag) end

---
--- 把最新一帧解码进屏幕 VRAM。X,Y,FLAG 的锚点语义与 img_draw() 相同，默认居中（flag 0x14）。
--- 不缩放：超屏帧回退为居中裁剪 blit。开销很低，可以每帧无条件调用。
---@param x? number
---@param y? number
---@param flag? number
---@return boolean ok
function img_scrair(x, y, flag) end


--[[ 操作 ]]--
---
--- 设置图像属性并返回当前 flag 值。OP 为 '+' 增加、'-' 移除、'=' 直接赋值。
---@param img img
---@param op "+"|"-"|"="
---@param flag number
---@return number flag
function img_set_flag(img, op, flag) end

---
--- 返回图像尺寸与属性。动画图像还会返回 FRAME_H（帧高）与 DELAYS（每帧显示毫秒数数组）。
---@param img img
---@return number w
---@return number h
---@return number bpp
---@return number flag
---@return number|nil frame_h
---@return table|nil delays
function img_info(img) end

---
--- 立即释放图像资源。对 img_loadscr() 的对象只是丢掉包装，借用的 VM 内存不受影响。
---@param img img
function img_close(img) end


--[[ 绘制 ]]--
---
--- 把图像绘制到 (X,Y)。OPFLAG 使用 blit 的锚点与混合位。
---@param img img
---@param x number
---@param y number
---@param opflag? number
function img_draw(img, x, y, opflag) end

---
--- 把图像的 (SX,SY,SW,SH) 区域绘制到 (X,Y)。
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
--- 旋转 ANGLE 度并缩放 ZOOMX,ZOOMY 绘制图像。
--- OPFLAG 保留、当前被忽略。SX..SH 必须在图像范围内；源 bpp 需与画布一致
--- （16↔32 与带调色板的 8bpp→16/32 可转换，其余组合不绘制）。
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
--- 把图像缩放到 DW,DH 并绘制在 (DX,DY)。OPFLAG bit8 水平镜像，bit9 垂直镜像。
--- 源区域超出图像时不绘制。
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
--- 绘制用 img_load(..., true) 加载的全部帧 GIF 的第 FRAMEIDX 帧。
--- 返回下一帧序号与其显示毫秒数。
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
