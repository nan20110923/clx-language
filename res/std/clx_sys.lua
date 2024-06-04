

---
--- Load an application where PARAM_STR can be accessed through the interface after the application is started.
--- The new application replaces the current application after loading.
---@param FILENAME string
---@param NA any
---@param PARAM_STR string
function load(FILENAME, NA, PARAM_STR) end

---
--- The application is run from scratch.
--- run() can be called from within the running program to reset it.
--- When PARAM_STR is provided, it can be accessed at runtime using stat(6).
---@param PARAM_STR string
function run(PARAM_STR) end

---
--- Reset the running state. This includes color palettes, camera positions, cropping and fill patterns.
function reset() end

---
--- Prints arguments to the host OS console for debugging. The function is similar to lua's original print.
function printh(...) end

---
--- Returns the number of seconds that have elapsed since the application ran.
--- This is not real-world time, but a logical time calculated from the number of frames.
function time() end

---
--- Time zone 0, seconds since 1970.
function utcsec() end


---
--- Converts the time according to the format, similar to the standard lua os.date.
---@param fmt string
---@param sec number
function utcdate(fmt, sec) end

---
--- Get the status of the system where X is located:
--- 0 memory usage in kBytes
--- 1 cpu usage in previous frame
--- 5 Platform version number
--- 6 Parameters when the application is loaded
--- 7 Current frame rate
--- 8 Set frame rate

--- 30 Availability of keyboard data
--- 31 Cached keyboard data
--- 32 x position of mouse/touch
--- 33 Mouse/touch y position 
--- 34 Key status of mouse/touch

--- 16..19
--- 46..49 Index of SFX currently playing on channels 0..3
--- 20..23
--- 50..53 Note number (0..31) on channels 0..3
--- 24/54 Index of the current playback mode
--- 25/55 Total number of played modes
--- 56 Number of ticks played in the current mode

--- 90..96 Local time Year, month, day, hour, minute, second, week(from 1 to 7 means from Sunday to Saturday)
---@param X number
function stat(X) end

---
--- Set the system state based on key, if there is no val, it means it is just a query to return the last value:
--- altc replacement color (alternative color used by fill template in 32-bit color mode)
--- tlmw width mask of the map used by tline
--- tlmh Height mask of the map used by tline
--- x offset of the map used by tlmx tline
--- y offset of the map used by tlmx tline
--- sprm sprite data address mapping, 0x60 means use vram address
--- scrm screen data address mapping, 0x60 means use vram address, other value means use sprite data address
--- mapw Map width definition, 0 means use specification default width
--- colm color mask definition, affects 4bpp mapping (analog fusion)
---@param key string
---@param val any
function statctl(key, val) end


---
--- Get a list of applications.
function __listcarts() end

---
--- Get the application parameters, if del is true, it will clear the parameters after getting them.
---@param del boolean
function __getparams(del) end

---
--- Load bios.
function __loadbioscart() end

---
--- Load the previous application (if any).
function __loadprevcart() end


---
--- Loads the system setup menu (general menu).
function __loadsettingscart() end


---
--- Loads the pause menu (if there is no parameter, it will do the inversion based on the current state).
---@param pause boolean
function __togglepausemenu(pause) end


---
--- Reload the application.
function __resetcart() end


---
--- Reads and returns the contents of the configuration file.
---@param filename string
function __cfgread(filename) end


---
--- Write the contents of the configuration file, return true on success.
---@param filename string
---@param str string
function __cfgwrite(filename, str) end


---
--- Delete the configuration file.
---@param filename string
function __cfgdel(filename) end

