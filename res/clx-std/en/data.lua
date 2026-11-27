---@meta

--[[
  CLX persistent cartridge storage: 256 integers (1024 bytes) per application.

  Nothing is saved automatically. Either write with dset(index, value, true) or call
  dflush() at a save point; otherwise unsaved changes are lost on reload or cartridge switch.
]]

---
--- Declares and opens the storage area. Must be called before dget/dset.
--- ID is the storage name, up to 64 characters, and it ends up in a filename, so stick to
--- letters, digits and underscores. Calling it again with the same id is harmless; a
--- different id raises an error and drops back to the BIOS. Returns false when opening fails.
---@param ID string
---@return boolean ok
function cartdata(ID) end

---
--- Returns the integer stored at INDEX (0..255).
---@param INDEX number
---@return number
function dget(INDEX) end

---
--- Stores VALUE at INDEX (0..255). FLUSH = true writes it to disk immediately.
---@param INDEX number
---@param VALUE number
---@param FLUSH? boolean
function dset(INDEX, VALUE, FLUSH) end

---
--- Writes every pending change to disk immediately.
function dflush() end
