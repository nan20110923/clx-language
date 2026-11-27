---@meta

--[[
  CLX lifecycle callbacks.

  Define any of these top-level functions and the runtime calls them. None are required:
  a cartridge that only draws can define _draw alone. Declaring them here gives hover text
  and completion instead of "undefined global".
]]

--- Called once after the application loads. Initialize variables and load resources here.
function _init() end

--- Called every frame while the application is active. Handle input and game logic here.
function _update() end

--- Called after _update whenever the canvas needs refreshing (roughly every frame).
function _draw() end

--- Called every frame while the application sits in the background (idle).
function _idle_update() end

--- Called when an idle application refreshes its canvas.
function _idle_draw() end

--- Called every frame while the configuration screen is active.
function _cfg_update() end

--- Called when the configuration screen refreshes its canvas.
function _cfg_draw() end

---
--- Called once after a cartridge is loaded as a background service.
---
--- Background services are the __svc__ section of a cartridge; they have no screen.
function _initsvc() end

--- Called every frame while the cartridge runs as a background service.
function _updatesvc() end

---
--- Called when a monitored service publishes a change (see svcmon()).
--- @param seq number event sequence from the service payload
--- @param name string service name
--- @param path string path inside the service
function _svcind(seq, name, path) end

---
--- Called when the application's running state changes (foreground / idle).
--- @param stat number the new state
--- @param statname string its name
function _setstat(stat, statname) end
