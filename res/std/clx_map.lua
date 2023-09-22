---
--- 查询地图坐标X,Y的数据，如果X,Y越界，查询返回0。
--- 地图数据是16位整数，通常用来表示精灵的索引号。
---@param X number
---@param Y number
function mget(X, Y) end


---
--- 设置地图坐标X,Y的数据。
--- 地图数据是16位整数，通常用来表示精灵的索引号。
---@param X number
---@param Y number
---@param VAL number
function mset(X, Y, VAL) end

---
--- 在屏幕区域SX,SY位置，开始绘制地图，地图区域启始位置位TILE_X，TILE_Y，宽度TILE_W，高度TILE_H。
--- TILE_W / TILE_H 默认为最大地图宽高。
--- LAYERS 是bit位定义的功能。如果有此参数，那么只有精灵属性数据对应bit位置有效时，才会绘制。
--- 例如LAYERS=0x5，那么精灵数据属性bit0或者bit2为1的精灵才会被绘制。
--- 精灵编号为0的图块默认不会被绘制。
---@param TILE_X number
---@param TILE_Y number
---@param SX number
---@param SY number
---@param TILE_W number
---@param TILE_H number
---@param LAYERS number
function map(TILE_X, TILE_Y, SX, SY, TILE_W, TILE_H, LAYERS) end

---
--- 从X0,Y0到X1,Y1绘制纹理线，纹理从map采样，如果LAYERS参数有效，那么只有精灵数据属性对应匹配的才会被采样绘制(同map())。
--- MX,MY 是对应的map数据的采样的启始点，以图块为单位，像素数据从图块对应的8x8的精灵图像上进行采集。
--- MDX,MDY 表示采样时对mx,my的增量间隔，每绘制一个像素，mx,my 会增加mdx,mdy。(缺省 0.125, 0, 表示x方向增加一个像素，y方向不变)
--- 精灵编号为0的图块默认不会被绘制。
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