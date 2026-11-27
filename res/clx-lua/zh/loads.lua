---@meta

--[[
  CLX 的代码加载：标准 Lua 的 `load` 在这里叫 `loads`。

  原因：`load` 这个名字被 CLX 的「加载应用」API 占用了（见 res/clx-std/sys.lua）。
  所以从字符串/reader 编译代码块要用 `loads`。

  另外两个标准函数在 CLX 里不可用：
    - `loadstring` 不存在（Lua 5.4 已移除，CLX 没有恢复）
    - `dofile` / `loadfile` 全局存在但只是报错占位，调用即抛错
      （卡带没有通用文件系统；代码复用请用 `#include` 预处理指令）

  `_G` 里仍然有 loadfile/dofile 这两个名字，但不要用。LuaLS 的
  meta/Lua 5.4 会把它们标成可用，这是唯一已知的误报。
]]

---
--- 从字符串或 reader 函数加载代码块（标准 Lua 5.4 的 `load`，在 CLX 里改名）。
---@param chunk string|function
---@param chunkname string
---@param mode string
---@param env table
---@return function
---@return string
function loads(chunk, chunkname, mode, env) end
