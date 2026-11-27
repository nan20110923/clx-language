---@meta

--[[
  CLX easing (built-in, no usemod needed).

  anim_effect/anim_calc and the Anim* constants are registered at cartridge startup.
  Note that the official doc's examples call usemod('anim') — it returns nil, the module is
  already there.
]]

-- Easing curves, for use with anim_effect and anim_calc.
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
--- Applies the easing curve EFFECT to X, the normalized progress (usually 0..1), and returns
--- the eased value.
---@param effect number
---@param x number
---@return number
function anim_effect(effect, x) end

---
--- Interpolates from APOS to ZPOS over ALLTICK ticks, using the easing curve EFFECT.
--- Returns the position corresponding to CURTICK.
---@param effect number
---@param apos number
---@param zpos number
---@param alltick number
---@param curtick number
---@return number
function anim_calc(effect, apos, zpos, alltick, curtick) end
