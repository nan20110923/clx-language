

---
--- Load an application where PARAM_STR can be accessed through the interface after the application is started.
--- The new application replaces the current application after loading.
---@param FILENAME string
---@param NA any
---@param PARAM_STR string
function load(FILENAME, NA, PARAM_STR) end



---
--- Read n bytes, starting address is ADDR.
---@param ADDR number
---@param N number
function peek(ADDR, N) end

---
--- Write byte data to address ADDR.
---@param ADDR number
---@param VAL1 number
---@param VAL2 number
function poke(ADDR, VAL1, VAL2, ...) end


---
--- Read short type data (2 bytes).
---@param ADDR number
function peek2(ADDR) end


---
--- Write short type data (2 bytes).
---@param ADDR number
---@param VAL1 number
---@param VAL2 number
function poke2(ADDR, VAL1, VAL2, ...) end


---
--- Read integer type data (4 bytes).
---@param ADDR number
function peek4(ADDR) end


---
--- Write integer type data (4 bytes).
---@param ADDR number
---@param VAL1 number
---@param VAL2 number
function poke4(ADDR, VAL1, VAL2, ...) end

---
--- Copy len length data from SOURCE_ADDR location to DEST_ADDR, with overlapping overwrites allowed for destination and original region.
---@param DEST_ADDR number
---@param SOURCE_ADDR number
---@param LEN number
function memcpy(DEST_ADDR, SOURCE_ADDR, LEN) end

---
--- Reloads the application data from inside the application file.
--- If a filename is provided, then the corresponding data inside the file is loaded, otherwise it is the current application data.
---@param DEST_ADDR number
---@param SOURCE_ADDR number
---@param LEN number
---@param FILENAME string
function reload(DEST_ADDR, SOURCE_ADDR, LEN, FILENAME) end


---
--- Fill byte value val for DEST_ADDR address, fill length len.
---@param DEST_ADDR number
---@param VAL number
---@param LEN number
function memset(DEST_ADDR, VAL, LEN) end