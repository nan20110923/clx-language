
---
--- Declare a storage area (ID is the name), this area can save 1024 bytes of data (256 integers), if there is data, it will load the current saved data, you must first call cartdata before using dget/dset, and can only be dropped once.
--- ID Maximum 64 length string, ID uniquely identifies the storage name, no special characters can be used.
---@param ID string
function cartdata(ID) end

---
--- Get the INDEXth integer data stored, INDEX=0..255.
---@param INDEX number
function dget(INDEX) end

---
--- Save integer data to location INDEX, INDEX=0..255.
--- FLUSH: true Indicates immediate save to disk.
---@param INDEX number
---@param VALUE number
---@param FLUSH boolean
function dset(INDEX, VALUE, FLUSH) end


---
--- Saves data to disk immediately.
--- If there is no flush, then the data will be updated to disk only when reloading or switching carts.
function dflush() end

