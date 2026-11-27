---@meta

--[[
  CLX 音频：音效、音乐、PCM 播放与麦克风录音。

  wave() 与 micpoll() 的 audiotype（0 PCM、1 ADPCM、2 G.711A、3 Opus）是 API 层编码，
  不是你自己协议里的 codec id。
]]

--[[ 音效 ]]--
---
--- 在 CHANNEL 上播放音效 N（0..63）。
--- CHANNEL：-1（默认）自动选空闲通道，-2 暂停所有通道上的音效。
--- 特殊 N 值只在显式给出 CHANNEL 时生效：-1 停止该通道的音效，-2 停止它的循环。
--- OFFSET 是起始 note（0..31），默认 0。
---@param N number
---@param CHANNEL? number
---@param OFFSET? number
function sfx(N, CHANNEL, OFFSET) end

--[[ 音乐 ]]--
---
--- 从模式 N（0..63）播放音乐；N = -1 停止。
--- FADE_LEN 是过渡时间（毫秒，默认 0）。CHANNEL_MASK 是保留给音乐的通道位域；
--- 显式指定通道的音效会忽略它，而自动选通道不查询这个掩码，所以要把音效固定在掩码之外的通道。
---@param N number
---@param FADE_LEN? number
---@param CHANNEL_MASK? number
function music(N, FADE_LEN, CHANNEL_MASK) end

--[[ PCM 播放 ]]--
---
--- 直接播放 PCM 音频数据。
--- 默认 16000Hz、16 位小端；HZ 与 BPP 只接受 0（缺省）、16000 和 16，
--- 传其他值整体拒绝并返回 0。
--- FROM..TO 是 1 基闭区间字节范围（FROM 默认 1）。
--- AUDIOTYPE：0 PCM（默认）、1 ADPCM、2 G.711A、3 Opus。Opus 数据按
--- [u16 大端长度][包] 分帧，包边界必须保持完整。
--- DATA 特殊值：'I' 初始化、'R' 重置缓冲、'D' 释放资源、'L' 返回已缓冲待播的字节数；
--- 不带参数调用返回剩余可写空间的字节数。
--- 返回 PRODUCED（写入的字节数；ADPCM/G.711A 按采样数）与 CONSUMED（本次从 DATA 实际消耗的
--- 字节数 —— 可能小于 DATA 长度，例如 Opus 尾部的不完整包，剩余部分留到下次）。
---@param data? string
---@param from? number
---@param to? number
---@param audiotype? number
---@param hz? number
---@param bpp? number
---@return number produced
---@return number consumed
function wave(data, from, to, audiotype, hz, bpp) end

--[[ 麦克风 ]]--
---
--- 获取麦克风录音数据。需要系统开启麦克风功能（usemod('mic')）。
--- FLAG：1 清缓冲区，2 取有效数据长度（16-bit 单位），3 取数据（MAXLEN 为最大 16-bit 单位数），
--- 4 取 FFT 数据。AUDIOTYPE：0 PCM、1 ADPCM、2 G.711A、3 Opus。
--- FLAG 4 时返回 AVG、MAXIDX、MAXVAL 与 FFT 数组（MAXLEN 为采样点数，0 = 不返回数组）。
---@param flag? number
---@param maxlen? number
---@param audiotype? number
---@return number avg
---@return number maxidx
---@return number maxval
---@return table ffts
function micpoll(flag, maxlen, audiotype) end
