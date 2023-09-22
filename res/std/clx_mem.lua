

---
--- 加载一个应用，PARAM_STR 可以在应用启动后通过接口访问。
--- 加载后新应用会替换当前应用。
---@param FILENAME string
---@param NA any
---@param PARAM_STR string
function load(FILENAME, NA, PARAM_STR) end



---
--- 读取n个字节，起始地址是addr。
---@param ADDR number
---@param N number
function peek(ADDR, N) end

---
--- 向地址addr写字节数据。
---@param ADDR number
---@param VAL1 number
---@param VAL2 number
function poke(ADDR, VAL1, VAL2, ...) end


---
--- 读取short数据(2字节)。
---@param ADDR number
function peek2(ADDR) end


---
--- 写short数据(2字节)。
---@param ADDR number
---@param VAL1 number
---@param VAL2 number
function poke2(ADDR, VAL1, VAL2, ...) end


---
--- 读取整数数据(4字节)。
---@param ADDR number
function peek4(ADDR) end


---
--- 写整数数据(4字节)。
---@param ADDR number
---@param VAL1 number
---@param VAL2 number
function poke4(ADDR, VAL1, VAL2, ...) end

---
--- 从source_addr位置拷贝len长度的数据到dest_addr，目的和原区域允许重叠覆盖。
---@param DEST_ADDR number
---@param SOURCE_ADDR number
---@param LEN number
function memcpy(DEST_ADDR, SOURCE_ADDR, LEN) end

---
--- 从应用文件里面重新加载应用数据。
--- 如果提供了文件名，那么会加载文件里面对应的数据，否则就是当前应用的数据。
---@param DEST_ADDR number
---@param SOURCE_ADDR number
---@param LEN number
---@param FILENAME string
function reload(DEST_ADDR, SOURCE_ADDR, LEN, FILENAME) end


---
--- 对dest_addr地址填充字节值val，填充长度len。
---@param DEST_ADDR number
---@param VAL number
---@param LEN number
function memset(DEST_ADDR, VAL, LEN) end