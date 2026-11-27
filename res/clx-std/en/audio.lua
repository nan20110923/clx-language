---@meta

--[[
  CLX audio: SFX, music, PCM playback and microphone capture.

  wave() and micpoll() deal in "audiotype" values (0 PCM, 1 ADPCM, 2 G.711A, 3 Opus).
  That is an API-level encoding, not a protocol codec id.
]]

--[[ SFX ]]--
---
--- Plays SFX N (0..63) on CHANNEL.
--- CHANNEL: -1 (default) picks a free channel, -2 pauses the SFX on every channel.
--- The special N values only take effect when CHANNEL is given explicitly:
--- -1 stops the SFX on that channel, -2 stops its loop.
--- OFFSET is the starting note (0..31), default 0.
---@param N number
---@param CHANNEL? number
---@param OFFSET? number
function sfx(N, CHANNEL, OFFSET) end

--[[ music ]]--
---
--- Plays music from pattern N (0..63); N = -1 stops it.
--- FADE_LEN is the crossfade time in milliseconds (default 0). CHANNEL_MASK is the bitfield
--- of channels reserved for music; SFX that name a channel explicitly ignore it, and auto
--- channel selection does not consult it, so pin SFX to channels outside the mask.
---@param N number
---@param FADE_LEN? number
---@param CHANNEL_MASK? number
function music(N, FADE_LEN, CHANNEL_MASK) end

--[[ PCM playback ]]--
---
--- Plays PCM audio data.
--- Defaults are 16000 Hz, 16-bit little-endian; HZ and BPP accept only 0 (default), 16000
--- and 16 — any other value rejects the call and returns 0.
--- FROM..TO is a 1-based inclusive byte range (FROM defaults to 1).
--- AUDIOTYPE: 0 PCM (default), 1 ADPCM, 2 G.711A, 3 Opus. Opus data is framed as
--- [u16 big-endian length][packet]; keep packet boundaries intact.
--- DATA special values: 'I' initialize, 'R' reset the buffer, 'D' release resources,
--- 'L' return the bytes buffered waiting to play. Called with no arguments it returns the
--- bytes of free space.
--- Returns PRODUCED (bytes written, or samples for ADPCM/G.711A) and CONSUMED (bytes actually
--- taken from DATA — it can be shorter than DATA, e.g. a trailing partial Opus packet, so
--- keep the remainder for the next call).
---@param data? string
---@param from? number
---@param to? number
---@param audiotype? number
---@param hz? number
---@param bpp? number
---@return number produced
---@return number consumed
function wave(data, from, to, audiotype, hz, bpp) end

--[[ microphone ]]--
---
--- Reads microphone data. The system must have capture enabled (usemod('mic')).
--- FLAG: 1 clear the buffer, 2 get the valid length in 16-bit units, 3 get data with MAXLEN
--- as the maximum amount in 16-bit units, 4 get FFT data.
--- AUDIOTYPE: 0 PCM, 1 ADPCM, 2 G.711A, 3 Opus.
--- For FLAG 4 it returns AVG, MAXIDX, MAXVAL and the FFT array (MAXLEN = sample count,
--- 0 = no array).
---@param flag? number
---@param maxlen? number
---@param audiotype? number
---@return number avg
---@return number maxidx
---@return number maxval
---@return table ffts
function micpoll(flag, maxlen, audiotype) end
