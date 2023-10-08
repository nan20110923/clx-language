---
--- Play music Play music starting from pattern N (0..63)
--- N = 0-63 Play music starting from pattern N
--- N = -1 stop
--- FADE_LEN: transition time (ms) (default: 0)
--- CHANNEL_MASK: defines the channel reserved for music (bit-bit mode)
--- If the command to play the sound effect specifies the channel to be used then the sound effect ignores the reserved option, if no channel is specified then the reserved channel will not be used.
---@param N number
---@param FADE_LEN number
---@param CHANNEL_MASK number
function music(N, FADE_LEN, CHANNEL_MASK) end


---
--- Play the sound effect N on the specified channel (CHANNEL), OFFSET is the data offset point of the sound effect, LENGTH is the data length.
--- CHANNEL Special values: 1: (default) automatically selects a channel that is not being used; 2: pauses all sound effects
--- N Special values: 1: stops the sound effect for the specified channel; 2: stops the sound effect loop for the specified channel
---@param N number
---@param CHANNEL number
---@param OFFSET number
---@param LENGTH number
function sfx(N, CHANNEL, OFFSET, LENGTH) end


---
--- Direct playback of pcm audio data, audio needs to meet device specification 22050hz, 16bit little format.
--- data has a special meaning when it is a special value.
--- wave('I') --- Initialize (request internal resources).
--- wave('R') -- reset data buffer.
--- wave('D') -- release resources
--- wave('L') -- return remaining buffer size
--- wave() -- Returns the remaining buffer size.
--- audiotype indicates audio type, default PCM: 1: adpcm; 2: G711a
---@param data string
---@param from number
---@param to number
---@param audiotype number
function wave(data, from, to, audiotype) end