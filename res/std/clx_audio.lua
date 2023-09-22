---
--- 播放音乐Play music starting from pattern N (0..63)
--- N = 0-63 从音乐模版N开始播放
--- N = -1 停止
--- FADE_LEN：过渡时间(ms) (default: 0)
--- CHANNEL_MASK：定义保留给音乐的通道(bit位方式)
--- 如果播放音效的命令指明了使用的通道,那么音效就忽略保留选项, 如果不指明通道,那么不会使用保留的通道。
---@param N number
---@param FADE_LEN number
---@param CHANNEL_MASK number
function music(N, FADE_LEN, CHANNEL_MASK) end


---
--- 在指定的通道(CHANNEL)上播放音效N，OFFSET是音效的数据偏移点，LENGTH是数据长度。
--- CHANNEL 特殊值: 1: (缺省值) 自动选择一个没有被使用的通道；2: 暂停所有音效
--- N 特殊值: 1: 停止指定通道的音效；2: 停止指定通道的音效循环
---@param N number
---@param CHANNEL number
---@param OFFSET number
---@param LENGTH number
function sfx(N, CHANNEL, OFFSET, LENGTH) end


---
--- 直接播放pcm音频数据，音频需要符合设备规格22050hz, 16bit little格式。
--- data 为特殊值时有特殊意义:
--- wave('I') -- 初始化(申请内部资源)
--- wave('R') -- 重置数据缓冲区
--- wave('D') -- 释放资源
--- wave('L') -- 返回剩余缓冲区大小
--- wave()    -- 返回剩余缓冲区大小
--- audiotype 表示音频类型, 默认PCM: 1: adpcm; 2: G711a
---@param data string
---@param from number
---@param to number
---@param audiotype number
function wave(data, from, to, audiotype) end