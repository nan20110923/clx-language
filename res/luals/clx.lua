--[[
  CLX 语言服务器插件（LuaLS 的 Lua.runtime.plugin 机制）。

  职责只有一件：让 LuaLS 把 .clx 文件当成 Lua 来读。

  ## 为什么需要它

  .clx 不是纯 Lua 文件：

      coloX-4P            <- 设备规格抬头
      version 1
      style: game
      ...
      __lua__             <- Lua 段从这里开始
      function _draw() ... end
      __gfx__             <- 精灵数据的十六进制块
      0000111122223333
      __map__
      ...

  抬头和资源段对 Lua 解析器都是语法错误。直接把原文喂给 LuaLS 会得到满屏
  红色波浪线（实测 30 条），而且 `__gfx__` 下面的十六进制会被当成数字表达式。

  ## 做法

  把 `__lua__` 段之外的内容逐行替换成等宽的注释：

      coloX-4P        ->  --loX-4P
      __gfx__         ->  --     （用空格补齐到原宽度）
      00001111        ->  --001111

  关键约束是**行数和每行列号必须完全不变**，这样 LuaLS 报回来的位置（诊断、
  补全、跳转）能直接对应到用户看到的原文。补 `-` 后面用空格而不是补 `-`，
  是为了让注释看起来整齐、也避免 `----` 被误认成别的标记。

  段规则与模拟器一致（见 coloX_cart.c）：`__xxx__` 单独成行时切换当前段，
  `__lua__` 之后的内容保留，直到下一个 `__xxx__`。

  ## 为什么返回 diff 而不是整串

  LuaLS 的 OnSetText 可以返回新字符串，也可以返回 diff 表。返回 **diff 表**
  时 LuaLS 会自己记下位置映射（script/string-merger.lua 的 getOffset /
  getOffsetBack），后续所有位置换算都走它。返回整串则 diffInfo 为空，位置
  换算退化成"原样透传"——现在因为等宽替换恰好正确，但那是巧合，一旦将来
  需要插入或删除内容就会错位。走 diff 让正确性由机制保证。

  diff 的 start/finish 是**1-based 字节偏移**，闭区间（string-merger.lua
  用 text:sub(cur, diff.start - 1) 切分，Lua 的 string 按字节索引）。
  所以下面全程用 string.byte 数长度，不能用 utf8.len —— 中文变量名会让
  字符数和字节数不等。

  ## 只处理 .clx

  同一个语言服务器进程也可能打开工作区里的 .lua 文件（#include 的目标文件
  就是普通 .lua）。那些文件是纯 Lua，不能改动，否则它们的行号会错。
]]

local M = {}

-- 段标记：单独一行、__ 开头 __ 结尾、中间至少一个字符。
-- 用 ^...$ 锚定整行，避免把 __lua__ 出现在字符串或注释里时误判。
local SECTION = '^%s*__[A-Za-z0-9_]+__%s*$'

--- 把一行变成等宽的注释行。
---
--- 整行替换成 `--` + 空格，而不是保留原内容（`'coloX-4P' -> '--loX-4P'`）。
--- 保留尾部看着更"信息量大"，但危险：数据行若以 `[[` 开头，加上 `--` 前缀就
--- 变成 `--[[`，意外打开一个长注释，把后面所有代码吞掉。全空格没有这个问题。
--- @param line string 不含换行符的单行
--- @return string
local function maskLine(line)
	local width = #line
	if width == 0 then
		-- 空行原样返回，省掉一次分配，也避免把 -- 塞进空行
		return line
	end
	if width == 1 then
		-- 单字符行补成 '-' 会变宽，只能原样返回；这种行在 cart 里只可能是空白
		return line
	end
	return '--' .. string.rep(' ', width - 2)
end

--- 计算文本的掩码，返回 (maskedText, diffs)。
--- @param text string 原始 .clx 内容
--- @return string maskedText
--- @return table diffs OnSetText 的 diff 表
local function mask(text)
	local diffs = {}
	local out = {}

	local offset = 0 -- 当前行起始的 0-based 字节偏移
	local inLua = false
	local pos = 1
	local length = #text

	while pos <= length + 1 do
		-- 找行尾（\n 或文本结束）
		local newline = string.find(text, '\n', pos, true)
		local lineEnd
		if newline then
			lineEnd = newline - 1
		else
			lineEnd = length
		end

		local line = string.sub(text, pos, lineEnd)
		-- 行尾可能是 \r\n，把 \r 单独留下不参与判断
		local carriageReturn = false
		if #line > 0 and string.sub(line, -1) == '\r' then
			carriageReturn = true
			line = string.sub(line, 1, -2)
		end

		-- 段标记：切换 inLua，并且这一行本身也要掩掉
		if string.match(line, SECTION) then
			inLua = string.match(line, '^%s*__lua__%s*$') ~= nil
			local masked = maskLine(line)
			if masked ~= line then
				diffs[#diffs + 1] = { start = offset + 1, finish = offset + #line, text = masked }
			end
			out[#out + 1] = masked .. (carriageReturn and '\r' or '') .. (newline and '\n' or '')
		elseif inLua or string.match(line, '^%s*$') then
			-- __lua__ 段内、或空行：原样保留
			out[#out + 1] = line .. (carriageReturn and '\r' or '') .. (newline and '\n' or '')
		else
			-- 抬头或其他资源段的数据行：掩掉
			local masked = maskLine(line)
			if masked ~= line then
				diffs[#diffs + 1] = { start = offset + 1, finish = offset + #line, text = masked }
			end
			out[#out + 1] = masked .. (carriageReturn and '\r' or '') .. (newline and '\n' or '')
		end

		-- 进位到下一行；offset 加上这一行的原始字节数 + 换行符
		local consumed = #line + (carriageReturn and 1 or 0)
		if newline then
			offset = offset + consumed + 1
			pos = newline + 1
		else
			break
		end
	end

	return table.concat(out), diffs
end

--- LuaLS 插件入口。
--- @param uri string 文档 URI
--- @param text string 原始文本
--- @return table|nil diff 表；返回 nil 表示不改动
function OnSetText(uri, text)
	-- 只处理 .clx；工作区里的普通 .lua（比如 #include 的目标）必须原样保留
	if not string.match(uri, '%.clx$') and not string.match(uri, '%.clx%?') then
		return nil
	end

	-- 没有 __lua__ 段就不是合法 cart，不做处理（让 LuaLS 报它自己的错，
	-- 这比我们猜一个修复方式更有用）
	if not string.match(text, '\n%s*__lua__%s*[\r\n]') and not string.match(text, '^%s*__lua__%s*[\r\n]') then
		return nil
	end

	local _, diffs = mask(text)
	if #diffs == 0 then
		return nil
	end
	return diffs
end

-- 导出内部函数便于将来单独测试；LuaLS 只调用 OnSetText
M.OnSetText = OnSetText
M.mask = mask
return M
