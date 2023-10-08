---
--- Queries the data for map coordinates X,Y. If X,Y is out of bounds, the query returns 0.
--- The map data is a 16-bit integer, usually used to represent the index number of the sprite.
---@param X number
---@param Y number
function mget(X, Y) end


---
--- Set the data for the map coordinates X,Y.
--- The map data is a 16-bit integer, usually used to represent the index number of the sprite.
---@param X number
---@param Y number
---@param VAL number
function mset(X, Y, VAL) end

---
--- In the screen area SX,SY position, start to draw the map, map area start position TILE_X, TILE_Y, width TILE_W, height TILE_H.
--- TILE_W / TILE_H is the maximum map width and height by default.
--- LAYERS is a bit bit defined function. If this parameter is present, then the sprite attribute data will only be drawn if the corresponding bit position is valid.
--- For example LAYERS=0x5, then sprites with a sprite data attribute bit0 or bit2 of 1 will be drawn.
--- Blocks with a sprite number of 0 will not be drawn by default.
---@param TILE_X number
---@param TILE_Y number
---@param SX number
---@param SY number
---@param TILE_W number
---@param TILE_H number
---@param LAYERS number
function map(TILE_X, TILE_Y, SX, SY, TILE_W, TILE_H, LAYERS) end

---
--- Draw texture lines from X0,Y0 to X1,Y1, textures are sampled from map, if the LAYERS parameter is valid then only sprite data attributes corresponding to matches will be sampled and drawn (same as map()).
--- MX,MY is the starting point for sampling the corresponding map data, in blocks, pixel data is taken from the 8x8 sprite image corresponding to the block.
--- MDX,MDY denotes the incremental interval of mx,my during sampling, for each pixel drawn, mx,my will be increased by mdx,mdy.(Default 0.125, 0, means one pixel is added in x-direction, y-direction is unchanged)
--- Blocks with a sprite number of 0 will not be drawn by default.
---@param X0 number
---@param Y0 number
---@param X1 number
---@param Y1 number
---@param MX number
---@param MY number
---@param MDX number
---@param MDY number
---@param LAYERS number
function tline(X0, Y0, X1, Y1, MX, MY, MDX, MDY, LAYERS) end