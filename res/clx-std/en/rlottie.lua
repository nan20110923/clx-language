---@meta

--[[
  CLX Lottie animation (rlottie).

  Opened with usemod('rlottie'). Since platform version 13 the rendering is done by ThorVG,
  which keeps this API compatible.
]]

---
--- Loads a Lottie animation from JSON and returns the animation object.
--- KEY is the cache identity and must be unique per animation; WIDTH/HEIGHT allocate the
--- render buffer. JSON usually comes from #blob.
---@param key string
---@param json_data string
---@param width number
---@param height number
---@return table animation
function rlottie_load(key, json_data, width, height) end

---
--- Closes and frees the animation. GC would do it too, but calling this reclaims the
--- resources earlier.
---@param animation table
function rlottie_close(animation) end

---
--- Returns the current frame, total frame count, frame rate, render width and render height.
---@param animation table
---@return number current_frame
---@return number total_frames
---@return number framerate
---@return number width
---@return number height
function rlottie_info(animation) end

---
--- Renders FRAME at (X,Y). Repeated requests for the same frame reuse the cached buffer.
---@param animation table
---@param frame number
---@param x number
---@param y number
---@param flag? number
function rlottie_draw(animation, frame, x, y, flag) end

---
--- Overrides an animation property. Deprecated.
--- TYPE selects the property, KEYPATH names it (wildcard `**` supported) and V1..V3 carry
--- the value; the frame cache is invalidated so the next rlottie_draw re-renders.
---@param animation table
---@param type number
---@param keypath string
---@param v1? number
---@param v2? number
---@param v3? number
function rlottie_prop(animation, type, keypath, v1, v2, v3) end

---
--- Returns the animation markers as an array of {name, startframe, endframe}.
---@param animation table
---@return table|{name: string, startframe: number, endframe: number}[]|nil
function rlottie_mark(animation) end
