---@meta

--[[
  CLX system API (mirrors the official system.md).

  The stat / statctl code tables are reproduced in full: they are the only place a user can
  look up rules like "90..96 is local time" or "dfps is the FPS overlay".
]]


--[[ system status ]]--
---
--- Returns system status X. Unlisted indices return 0.
---   0  memory use (KB)
---   1  CPU load of the previous frame (0..1)
---   2  CPU load placeholder (currently always 0.5)
---   4  clipboard contents (currently always an empty string)
---   5  platform version (currently 14)
---   6  parameter string passed to load() (or `-a` on desktop builds)
---   7  current FPS
---   8  configured FPS
---   12 milliseconds since boot
---   30 keyboard data available (boolean)
---   31 cached keyboard data
---   32 mouse/touch x
---   33 mouse/touch y
---   34 mouse/touch button state
---   16..19 / 46..49  SFX index playing on channel 0..3
---   20..23 / 50..53  note (0..31) on channel 0..3
---   24 / 54  current pattern index
---   25 / 55  total patterns played
---   26 / 56  ticks played in the current pattern
---   89  seconds the device has been running (integer and fraction, two returns)
---   90..96  local time: year, month, day, hour, minute, second, weekday (1 = Sunday)
---   97  duration of the previous frame in seconds
---   100 breadcrumb string passed as load()'s 2nd argument
---   108 always 32
---   9..11  ESP32S3 firmware only: free heap / littlefs / TF card info (three returns each)
---@param X number
---@return number|string|boolean value
function stat(X) end

---
--- Sets or queries a system state. Without VAL it only reads the current value and returns it;
--- with VAL it applies the value and returns the previous one.
---   altc  replacement color (used by fill patterns in 32bpp mode)
---   tlmw / tlmh  map width / height mask used by tline
---   tlmx / tlmy  map offset used by tline
---   sprm  sprite data address mapping (0x60 = VRAM address)
---   scrm  screen data address mapping (0 = sprite sheet, otherwise VRAM)
---   mapw  map width (0 = the spec default), also affects map()/mget()/mset()
---   colm  color mask: 4bpp low nibble write + high nibble read, 8bpp a 16-bit
---         combination (low byte write mask, high byte read mask, default 0xffff),
---         16bpp an alpha blend parameter
---   nedf  round screen display flags (round firmware + 128-wide 4bpp only):
---         bit0 = keep the picture inside the circle, bit1 = keep the aspect ratio,
---         bit2 = disable scaling
---   dfps  global FPS/CPU debug overlay: truthy on, false or 0 off, omit to query
---         (default off, persists across cartridges)
--- Opus codec keys (only on firmware built with Opus), each with the three-state convention
--- "omit = query, val >= 0 = set, val == -1 = restore default":
---   oers / odrs  sample rate  8000/12000/16000/24000/48000 (default 16000)
---   oedm / oddm  frame length 5/10/20/40/60 ms (default 60)
---   oebt  bitrate, 0 = auto (default 0)
---   oecp  complexity 0..10 (default 6)
---   oeap  application 0 = VOIP, 1 = AUDIO, 2 = LOWDELAY (default 0)
---   orst  destroy a codec so the next use rebuilds it: omit or -1 = both, 0 = encoder,
---         1 = decoder
--- Encoder keys start with `oe`, decoder keys with `od`; the two must agree on sample rate
--- and frame length to interoperate.
---@param key string
---@param val? any
---@return any previous_value
function statctl(key, val) end


--[[ time ]]--
---
--- Seconds since the application started, computed from the frame count
--- (logical time, not wall-clock time).
---@return number
function time() end

---
--- Same as time(): seconds since the application started.
---@return number
function t() end

---
--- Seconds since 1970 in UTC. (Not recommended.)
---@return number
function utcsec() end

---
--- Formats a time like the standard os.date. FMT defaults to "%c"; prefix it with `!` to
--- force UTC, or pass "*t" to get a table with year/month/day/hour/min/sec/wday/yday/isdst.
--- SEC is a Unix timestamp, defaulting to now. (Not recommended: prefer stat(90..96).)
---@param fmt? string
---@param sec? number
---@return string|table
function utcdate(fmt, sec) end


--[[ application management ]]--
---
--- Loads and switches to another application. NA is the breadcrumb the new cartridge reads
--- back through stat(100); PARAM_STR is available to it through stat(6).
---@param FILENAME string
---@param NA? string
---@param PARAM_STR? string
function load(FILENAME, NA, PARAM_STR) end

---
--- Restarts the current application from scratch. Takes no arguments.
function run() end

---
--- Restores the running state: palettes, camera, clip rectangle and fill patterns.
function reset() end

-- reload(dest, source, len [, filename]) reloads application data into memory.
-- It is declared in mem.lua, together with the full parameter table.


--[[ background services ]]--
---
--- Fetches service data at the dot-separated PATH (e.g. "wifi.sta.ip").
--- On a hit it returns up to three values: data, version id VID and the TTL.
--- FILTERVID is a VID you already hold: when the data has not changed it returns
--- nil plus that VID, which turns this into a change detector.
---@param path string
---@param filtervid? number
---@return any data
---@return number vid
---@return number ttl
function svcget(path, filtervid) end

---
--- Adds service data under the root KEY (replacing that root variable outright, no path
--- semantics). VID is an optional version id (default 0). Service names starting with `$`
--- cannot be written. Returns true on success.
---@param key string
---@param vid? number
---@param data any
---@return boolean ok
function svcadd(key, vid, data) end

---
--- Sets field NAME to DATA under the dot-separated path prefix PATH. Paths starting with
--- `$` cannot be written. Returns true on success.
---@param path string
---@param name string
---@param data any
---@return boolean ok
function svcset(path, name, data) end

---
--- Sends a request to a service, e.g. svcreq("http", "myservice.api").
---@param type string
---@param name_path string
function svcreq(type, name_path) end

---
--- Subscribes to change notifications for PATH (empty string = every event of that service).
--- Several paths may be registered under the same NAME. Notifications arrive in the global
--- _svcind(seq, name, path) callback. Returns true on success.
---@param name string
---@param path string
---@return boolean ok
function svcmon(name, path) end


--[[ foreground / idle ]]--
---
--- Moves the current application to idle (background). ARG is passed through to the BIOS
--- idle handler.
---@param arg? any
function toidle(arg) end

---
--- Requests that the application move to the foreground (active). Returns true on success.
--- PRI and FORCE are forwarded to the BIOS.
---@param pri? number
---@param force? boolean
---@return boolean ok
function tofg(pri, force) end


--[[ data tools ]]--
---
--- zlib-compresses DATA over the 1-based range FROM..TO (default everything) at LEVEL 0..9.
--- The remaining arguments are the advanced zlib options (method, windowBits, memLevel,
--- strategy, dict). Returns the compressed string and the zlib return code.
---@param data string
---@param from? number
---@param to? number
---@param level? number
---@param ... any
---@return string compressed
---@return number zlib_code
function compress(data, from, to, level, ...) end

---
--- zlib-decompresses DATA over the 1-based range FROM..TO. Supports raw streams
--- (negative windowBits) and a dictionary.
---@param data string
---@param from? number
---@param to? number
---@param ... any
---@return string decompressed
function decompress(data, from, to, ...) end

---
--- Returns the MD5 digest of DATA as 16 raw bytes.
---@param data string
---@return string digest
function md5sum(data) end

---
--- Returns the MD5 digest of DATA as a 32-character lowercase hex string.
---@param data string
---@return string hex
function md5sumhexa(data) end

---
--- Returns the SHA-1 digest of DATA as 20 raw bytes.
---@param data string
---@return string digest
function sha1sum(data) end

---
--- Returns the SHA-1 digest of DATA as a 40-character lowercase hex string.
---@param data string
---@return string hex
function sha1sumhexa(data) end

---
--- Writes its arguments to the host OS console, like the standard print but for debugging.
--- The screen version is print (see text.lua), so use printh for logs.
---@param ... any
function printh(...) end


--[[ modules ]]--
---
--- Loads an optional module: 'mic', 'net', 'vg', 'sim', 'pad', 'padmag', 'b2d'
--- (availability depends on what the firmware was built with). Returns true on success.
--- anim, img and cjson need no usemod: anim and img are always registered, cjson goes
--- through require().
---@param modname string
---@return boolean ok
function usemod(modname) end


--[[ internal: application management ]]--
--- Returns the list of applications.
function __listcarts() end

---
--- Returns the application parameters. DEL = true clears them after reading.
---@param del? boolean
---@return string|nil
function __getparams(del) end

--- Loads the BIOS.
function __loadbioscart() end

--- Loads the previous application, if any.
function __loadprevcart() end

--- Loads the system settings menu.
function __loadsettingscart() end

---
--- Toggles the pause menu. Without PAUSE it inverts based on the current state.
---@param pause? boolean
function __togglepausemenu(pause) end

--- Reloads the application.
function __resetcart() end


--[[ internal: configuration files ]]--
---
--- Returns the contents of a configuration file.
---@param filename string
---@return string|nil
function __cfgread(filename) end

---
--- Writes a configuration file. Returns true on success.
---@param filename string
---@param str string
---@return boolean ok
function __cfgwrite(filename, str) end

---
--- Deletes a configuration file.
---@param filename string
---@return boolean ok
function __cfgdel(filename) end


--[[ internal: resources ]]--
---
--- Returns cartridge information for CARTNAME: size, filename, specid, ver, style, name,
--- author, desc and more.
---@param cartname? string
---@return table info
function __cartinfo(cartname) end

---
--- Reads a resource file. `name` can be 'size' to just get the length, and 'fullpath'
--- switches to absolute-path mode. FROM..TO select a byte range.
---@param name string
---@param from? number
---@param to? number
---@return string|nil data
function __resread(name, from, to) end

---
--- Lists resource files. PATTERN accepts '|'-separated alternatives and the '*' / '?'
--- wildcards (an exact name matches literally; empty or nil means no filter). SUBDIR is
--- relative to the cartridge directory (a leading '/' means absolute-path mode).
--- TYPE 'dir' or 'all' also lists directories; DETAIL = true stats each file for its size.
--- Returns an array of {name =, path =, type = "file"|"dir", size =}, where path can be
--- passed straight to __resread.
---@param pattern? string
---@param subdir? string
---@param type? "file"|"dir"|"all"
---@param detail? boolean
---@return table|{name: string, path: string, type: string, size: number}[]
function __reslist(pattern, subdir, type, detail) end

---
--- Returns the message of the most recent load error.
---@return string message
function __getbioserror() end
