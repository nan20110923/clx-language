
---
--- 声明一个存储区域(ID是名字)，此区域可以保存1024个字节的数据(256个整数)，如果有数据，会加载当前保存的数据，使用dget/dset前必须首先调用cartdata，并且只能掉用一次。
--- ID 最大64长度的字符串，ID唯一标识存储名字，不能使用特殊字符。
---@param ID string
function cartdata(ID) end

---
--- 获取存储的第INDEX个整数数据，INDEX=0..255。
---@param INDEX number
function dget(INDEX) end

---
--- 保存整数数据到第INDEX的位置，INDEX=0..255。
--- FLUSH: true 表示立即保存到磁盘。
---@param INDEX number
---@param VALUE number
---@param FLUSH boolean
function dset(INDEX, VALUE, FLUSH) end


---
--- 立即保存数据到磁盘。
--- 如果没有flush, 那么数据将在重新加载或者切换cart时才更新到磁盘。
function dflush() end

