---
--- 以像素为单位设置剪切矩形。 所有绘图操作将被裁剪到 x, y 处宽度和高度为 w,h 的矩形。
--- clip() 进行重置。
--- 当 CLIP_PREVIOUS 为 true 时，用旧的裁剪区域裁剪新的裁剪区域。
---@param X number
---@param Y number
---@param W number
---@param H number
---@param CLIP_PREVIOUS boolean
function clip(X, Y, W, H, CLIP_PREVIOUS) end