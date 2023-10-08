--[[ builtin anim ]]--
AnimLinear=1
AnimEaseIn=2
AnimEaseOut=3
AnimEaseInOut=4
AnimEaseInCubic=5
AnimEaseOutCubic=6
AnimEaseInOutCubic=7
AnimEaseInQuart=8
AnimEaseOutQuart=9
AnimEaseInOutQuart=10
AnimEaseInQuint=11
AnimEaseOutQuint=12
AnimEaseInOutQuint=13
AnimEaseInSine=14
AnimEaseOutSine=15
AnimEaseInOutSine=16
AnimEaseInExpo=17
AnimEaseOutExpo=18
AnimEaseInOutExpo=19
AnimEaseInCirc=20
AnimEaseOutCirc=21
AnimEaseInOutCirc=22
AnimEaseInBack=23
AnimEaseOutBack=24
AnimEaseInOutBack=25
AnimEaseInElastic=26
AnimEaseOutElastic=27
AnimEaseInOutElastic=28
AnimEaseInBounce=29
AnimEaseOutBounce=30
AnimEaseInOutBounce=31

---
--- 根据当前x，返回按照指定的effect动画类型函数计算的数值。x通常采用[0,1.0]
---@param effect number
---@param x number
function anim_effect(effect, x) end


---
--- 根据curtick，计算动画位置。返回curtick对应的pos
---@param effect number
---@param apos number
---@param zpos number
---@param alltick number
---@param curtick number
function anim_calc(effect, apos,zpos,alltick,curtick) end