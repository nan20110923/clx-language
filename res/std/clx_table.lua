---
--- Adds the element val at index position inside the table, index is not passed to indicate that it is appended to the end.
---@param tbl table
---@param val any
---@param index number
function add(tbl, val, index) end

---
--- Finds and deletes elements inside the table that are equal to val (only the first one found).
---@param tbl table
---@param val any
function del(tbl, val) end

---
--- Removes the element at index position in the table, if index is not passed, it means the last one is removed.
---@param tbl table
---@param index number
function deli(tbl, index) end

---
--- Returns the length of the table (#tbl), or the number of elements inside the table equal to val, if val is supplied.
---@param tbl table
---@param val any
function count(tbl, val) end

---
--- An iterator function that returns a table, used in a for loop to iterate over non-nil array data.
---@param tbl table
function all(tbl) end

---
--- An iterative array, calling fun on each non-nil element.
---@param tbl table
---@param fun function
function foreach(tbl, fun) end