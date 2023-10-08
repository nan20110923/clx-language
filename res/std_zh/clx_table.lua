---
--- 在表里面index位置添加元素val，index不传表示追加到最后。
---@param tbl table
---@param val any
---@param index number
function add(tbl, val, index) end

---
--- 查找并删除表里面的和val相等的元素(只删第一个找到的)。
---@param tbl table
---@param val any
function del(tbl, val) end

---
--- 删除表里面第index位置的元素，如果index不传，表示删除最后一个。
---@param tbl table
---@param index number
function deli(tbl, index) end

---
--- 返回表的长度(#tbl)，如果val提供了，那么返回表里面等于val的元素的个数。
---@param tbl table
---@param val any
function count(tbl, val) end

---
--- 返回表的迭代函数，用在for循环，迭代非nil的数组数据。
---@param tbl table
function all(tbl) end

---
--- 迭代表的数组，对每个非nil元素调用fun。
---@param tbl table
---@param fun function
function foreach(tbl, fun) end