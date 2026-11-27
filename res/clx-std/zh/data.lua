---@meta

--[[
  CLX 卡带持久化存储：每个应用 256 个整数（1024 字节）。

  数据不会自动保存。要么用 dset(index, value, true) 立即落盘，要么在关键点调用 dflush()；
  否则重新加载或切换卡带时未保存的修改会丢失。
]]

---
--- 声明并打开存储区域。使用 dget/dset 前必须先调用。
--- ID 是存储名，最长 64 字符，会作为文件名的一部分，所以只用字母、数字与下划线。
--- 用同一 id 重复调用无害；用不同 id 会报错并退回 BIOS。打开失败时返回 false。
---@param ID string
---@return boolean ok
function cartdata(ID) end

---
--- 返回第 INDEX（0..255）个整数数据。
---@param INDEX number
---@return number
function dget(INDEX) end

---
--- 把 VALUE 存到第 INDEX（0..255）个位置。FLUSH = true 立即写入磁盘。
---@param INDEX number
---@param VALUE number
---@param FLUSH? boolean
function dset(INDEX, VALUE, FLUSH) end

---
--- 立即把所有未保存的修改写入磁盘。
function dflush() end
