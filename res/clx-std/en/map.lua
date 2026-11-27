---@meta

--[[
  CLX map: an 8x8 tile grid where each cell is a 16-bit value, usually a sprite index.
  Tiles with sprite number 0 are not drawn. Map dimensions come from the spec;
  statctl('mapw', w) overrides the width (0 = default) and affects map()/mget()/mset().
]]

---
--- Returns the tile at map coordinates (X,Y), or 0 when out of bounds or when the tile
--- points past the sprite sheet.
---@param X number
---@param Y number
---@return number value
function mget(X, Y) end

---
--- Sets the tile at map coordinates (X,Y).
---@param X number
---@param Y number
---@param VAL number
function mset(X, Y, VAL) end

---
--- Draws the map region starting at tile (TILE_X,TILE_Y) at screen position (SX,SY).
--- TILE_W,TILE_H is the number of tiles to draw and defaults to the whole map — passing nil
--- explicitly counts as 0 and draws nothing.
--- LAYERS is a bitmask: when present, only tiles whose sprite flags intersect it are drawn,
--- e.g. 0x5 draws tiles with flag bit0 or bit2 set.
---@param TILE_X? number
---@param TILE_Y? number
---@param SX? number
---@param SY? number
---@param TILE_W? number
---@param TILE_H? number
---@param LAYERS? number
function map(TILE_X, TILE_Y, SX, SY, TILE_W, TILE_H, LAYERS) end

---
--- Draws a texture line from (X0,Y0) to (X1,Y1) sampled from the map.
--- MX,MY is the sampling start in tiles; pixels come from the 8x8 sprite of each tile.
--- MDX,MDY is the per-pixel tile increment (default 1/8, 0). LAYERS filters by sprite flags
--- like map(). Tiles with sprite number 0 are not drawn.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param MX number
---@param MY number
---@param MDX? number
---@param MDY? number
---@param LAYERS? number
function tline(X0, Y0, X1, Y1, MX, MY, MDX, MDY, LAYERS) end
