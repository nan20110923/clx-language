---@meta

--[[
  CLX table helpers.

  These are globals, not members of the standard table.* library. The standard table.*
  functions (concat/insert/remove/move/pack/unpack/sort) still exist and are provided by
  LuaLS itself.
]]

---
--- Inserts VAL at position INDEX, or appends it when INDEX is omitted.
---@param tbl table
---@param val any
---@param index? number
function add(tbl, val, index) end

---
--- Finds and removes the first element equal to VAL.
---@param tbl table
---@param val any
function del(tbl, val) end

---
--- Removes the element at INDEX, or the last element when INDEX is omitted.
---@param tbl table
---@param index? number
function deli(tbl, index) end

---
--- Returns #tbl, or the number of elements equal to VAL when VAL is given.
---@param tbl table
---@param val? any
---@return number
function count(tbl, val) end

---
--- Returns an iterator over the non-nil array part of TBL, for use in a for loop.
---@param tbl table
---@return function
function all(tbl) end

---
--- Calls FUN for every non-nil element of TBL.
---@param tbl table
---@param fun function
function foreach(tbl, fun) end
