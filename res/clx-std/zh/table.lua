---@meta

--[[
  CLX 表辅助函数。

  这些是全局函数，不属于标准 table.* 库。标准 table.*（concat/insert/remove/move/pack/
  unpack/sort）仍然存在，由 LuaLS 自己提供。
]]

---
--- 在 INDEX 位置插入 VAL；省略 INDEX 时追加到末尾。
---@param tbl table
---@param val any
---@param index? number
function add(tbl, val, index) end

---
--- 找到并删除第一个等于 VAL 的元素。
---@param tbl table
---@param val any
function del(tbl, val) end

---
--- 删除 INDEX 位置的元素；省略 INDEX 时删最后一个。
---@param tbl table
---@param index? number
function deli(tbl, index) end

---
--- 返回 #tbl；给了 VAL 时返回等于 VAL 的元素个数。
---@param tbl table
---@param val? any
---@return number
function count(tbl, val) end

---
--- 返回遍历 TBL 非 nil 数组部分的迭代器，用于 for 循环。
---@param tbl table
---@return function
function all(tbl) end

---
--- 对 TBL 的每个非 nil 元素调用 FUN。
---@param tbl table
---@param fun function
function foreach(tbl, fun) end
