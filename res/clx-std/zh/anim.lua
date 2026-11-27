---@meta

--[[
  CLX 缓动（内建，不需要 usemod）。

  anim_effect/anim_calc 与全部 Anim* 常量在卡带启动时即已注册。
  官方文档示例里写的 usemod('anim') 会返回 nil —— 模块本来就在。
]]

-- 缓动曲线，配合 anim_effect 与 anim_calc 使用。
AnimLinear = 1
AnimEaseIn = 2
AnimEaseOut = 3
AnimEaseInOut = 4
AnimEaseInCubic = 5
AnimEaseOutCubic = 6
AnimEaseInOutCubic = 7
AnimEaseInQuart = 8
AnimEaseOutQuart = 9
AnimEaseInOutQuart = 10
AnimEaseInQuint = 11
AnimEaseOutQuint = 12
AnimEaseInOutQuint = 13
AnimEaseInSine = 14
AnimEaseOutSine = 15
AnimEaseInOutSine = 16
AnimEaseInExpo = 17
AnimEaseOutExpo = 18
AnimEaseInOutExpo = 19
AnimEaseInCirc = 20
AnimEaseOutCirc = 21
AnimEaseInOutCirc = 22
AnimEaseInBack = 23
AnimEaseOutBack = 24
AnimEaseInOutBack = 25
AnimEaseInElastic = 26
AnimEaseOutElastic = 27
AnimEaseInOutElastic = 28
AnimEaseInBounce = 29
AnimEaseOutBounce = 30
AnimEaseInOutBounce = 31

---
--- 把缓动曲线 EFFECT 应用到归一化进度 X（通常 0..1），返回缓动后的值。
---@param effect number
---@param x number
---@return number
function anim_effect(effect, x) end

---
--- 用缓动曲线 EFFECT 在 ALLTICK tick 内从 APOS 插值到 ZPOS，
--- 返回 CURTICK 对应的位置。
---@param effect number
---@param apos number
---@param zpos number
---@param alltick number
---@param curtick number
---@return number
function anim_calc(effect, apos, zpos, alltick, curtick) end
