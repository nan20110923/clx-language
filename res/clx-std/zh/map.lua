---@meta

--[[
  CLX 地图：8x8 图块网格，每格是 16 位值，通常表示精灵索引。精灵编号为 0 的图块不绘制。
  地图尺寸来自规格；statctl('mapw', w) 可覆盖宽度（0 = 默认），影响 map()/mget()/mset()。
]]

---
--- 返回地图坐标 (X,Y) 的图块，越界或图块编号超出精灵表范围时返回 0。
---@param X number
---@param Y number
---@return number value
function mget(X, Y) end

---
--- 设置地图坐标 (X,Y) 的图块。
---@param X number
---@param Y number
---@param VAL number
function mset(X, Y, VAL) end

---
--- 从图块 (TILE_X,TILE_Y) 开始的地图区域绘制到屏幕 (SX,SY)。
--- TILE_W,TILE_H 是要绘制的图块数量，默认为整张地图 —— 显式传 nil 会被当作 0，什么都不画。
--- LAYERS 是位掩码：给出时只绘制精灵标志与之相交的图块，例如 0x5 绘制 flag bit0 或 bit2
--- 为 1 的图块。
---@param TILE_X? number
---@param TILE_Y? number
---@param SX? number
---@param SY? number
---@param TILE_W? number
---@param TILE_H? number
---@param LAYERS? number
function map(TILE_X, TILE_Y, SX, SY, TILE_W, TILE_H, LAYERS) end

---
--- 从 (X0,Y0) 到 (X1,Y1) 画纹理线，纹理从地图采样。
--- MX,MY 是采样起点（图块单位），像素取自对应图块的 8x8 精灵。
--- MDX,MDY 是每像素的图块增量（默认 1/8, 0）。LAYERS 与 map() 一样按精灵标志过滤。
--- 精灵编号为 0 的图块不绘制。
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
