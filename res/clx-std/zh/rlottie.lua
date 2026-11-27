---@meta

--[[
  CLX Lottie 动画（rlottie）。

  用 usemod('rlottie') 打开。自平台版本 13 起渲染由 ThorVG 承担，API 保持兼容。
]]

---
--- 从 JSON 加载 Lottie 动画并返回动画对象。
--- KEY 是缓存标识，每个动画必须唯一；WIDTH/HEIGHT 分配渲染缓冲区。
--- JSON 通常用 #blob 从外部文件加载。
---@param key string
---@param json_data string
---@param width number
---@param height number
---@return table animation
function rlottie_load(key, json_data, width, height) end

---
--- 关闭并释放动画。GC 也会回收，但手动调用可以更早拿回资源。
---@param animation table
function rlottie_close(animation) end

---
--- 返回当前帧、总帧数、帧率、渲染宽度与渲染高度。
---@param animation table
---@return number current_frame
---@return number total_frames
---@return number framerate
---@return number width
---@return number height
function rlottie_info(animation) end

---
--- 把第 FRAME 帧渲染到 (X,Y)。重复请求同一帧会复用缓存缓冲区。
---@param animation table
---@param frame number
---@param x number
---@param y number
---@param flag? number
function rlottie_draw(animation, frame, x, y, flag) end

---
--- 覆盖动画属性。已废弃。
--- TYPE 选择属性类型，KEYPATH 指定路径（支持通配符 `**`），V1..V3 是属性值；
--- 修改会让帧缓存失效，下次 rlottie_draw 重新渲染。
---@param animation table
---@param type number
---@param keypath string
---@param v1? number
---@param v2? number
---@param v3? number
function rlottie_prop(animation, type, keypath, v1, v2, v3) end

---
--- 返回动画标记，数组每项为 {name, startframe, endframe}。
---@param animation table
---@return table|{name: string, startframe: number, endframe: number}[]|nil
function rlottie_mark(animation) end
