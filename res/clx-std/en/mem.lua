---@meta

--[[
  CLX memory access: byte/short/int reads and writes plus block copies.

  Addresses come from the __vm_* constants (declared in graphics.lua). peek2/peek4 are
  signed; the whole VM is a flat 32-bit address space.
]]

--[[ reads ]]--
---
--- Reads N bytes starting at ADDR and returns them as separate values.
---@param ADDR number
---@param N? number
---@return number
---@return number ...
function peek(ADDR, N) end

---
--- Reads a signed 16-bit value (2 bytes, little-endian).
---@param ADDR number
---@return number
function peek2(ADDR) end

---
--- Reads a signed 32-bit value (4 bytes, little-endian).
---@param ADDR number
---@return number
function peek4(ADDR) end


--[[ writes ]]--
---
--- Writes one or more bytes starting at ADDR.
---@param ADDR number
---@param VAL1 number
---@param ... number
function poke(ADDR, VAL1, ...) end

---
--- Writes one or more 16-bit values starting at ADDR.
---@param ADDR number
---@param VAL1 number
---@param ... number
function poke2(ADDR, VAL1, ...) end

---
--- Writes one or more 32-bit values starting at ADDR.
---@param ADDR number
---@param VAL1 number
---@param ... number
function poke4(ADDR, VAL1, ...) end


--[[ block operations ]]--
---
--- Copies LEN bytes from SOURCE_ADDR to DEST_ADDR. Overlapping regions are handled with
--- memmove semantics.
---@param DEST_ADDR number
---@param SOURCE_ADDR number
---@param LEN number
function memcpy(DEST_ADDR, SOURCE_ADDR, LEN) end

---
--- Fills LEN bytes starting at DEST_ADDR with the byte value VAL.
---@param DEST_ADDR number
---@param VAL number
---@param LEN number
function memset(DEST_ADDR, VAL, LEN) end

---
--- Reloads application data from the cartridge into memory: LEN bytes taken from offset
--- SOURCE_ADDR of the file are written to DEST_ADDR. FILENAME loads data from another
--- cartridge, defaulting to the current one.
---@param DEST_ADDR? number
---@param SOURCE_ADDR? number
---@param LEN? number
---@param FILENAME? string
function reload(DEST_ADDR, SOURCE_ADDR, LEN, FILENAME) end
