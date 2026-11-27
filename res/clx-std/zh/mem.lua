---@meta

--[[
  CLX 内存访问：字节/字/双字读写与块操作。

  地址来自 __vm_* 常量（声明在 graphics.lua）。peek2/peek4 有符号；整个 VM 是扁平的
  32 位地址空间。
]]

--[[ 读取 ]]--
---
--- 从 ADDR 开始读取 N 个字节，作为多个返回值返回。
---@param ADDR number
---@param N? number
---@return number
---@return number ...
function peek(ADDR, N) end

---
--- 读取有符号 16 位值（2 字节，小端）。
---@param ADDR number
---@return number
function peek2(ADDR) end

---
--- 读取有符号 32 位值（4 字节，小端）。
---@param ADDR number
---@return number
function peek4(ADDR) end


--[[ 写入 ]]--
---
--- 从 ADDR 开始写入一个或多个字节。
---@param ADDR number
---@param VAL1 number
---@param ... number
function poke(ADDR, VAL1, ...) end

---
--- 从 ADDR 开始写入一个或多个 16 位值。
---@param ADDR number
---@param VAL1 number
---@param ... number
function poke2(ADDR, VAL1, ...) end

---
--- 从 ADDR 开始写入一个或多个 32 位值。
---@param ADDR number
---@param VAL1 number
---@param ... number
function poke4(ADDR, VAL1, ...) end


--[[ 块操作 ]]--
---
--- 从 SOURCE_ADDR 拷贝 LEN 字节到 DEST_ADDR。源与目标区域可重叠（memmove 语义）。
---@param DEST_ADDR number
---@param SOURCE_ADDR number
---@param LEN number
function memcpy(DEST_ADDR, SOURCE_ADDR, LEN) end

---
--- 从 DEST_ADDR 开始，把 LEN 个字节填成 VAL。
---@param DEST_ADDR number
---@param VAL number
---@param LEN number
function memset(DEST_ADDR, VAL, LEN) end

---
--- 从应用文件重新加载数据到内存：从文件偏移 SOURCE_ADDR 取 LEN 字节写到 DEST_ADDR。
--- FILENAME 可指定其他 cartridge，默认当前应用。
---@param DEST_ADDR? number
---@param SOURCE_ADDR? number
---@param LEN? number
---@param FILENAME? string
function reload(DEST_ADDR, SOURCE_ADDR, LEN, FILENAME) end
