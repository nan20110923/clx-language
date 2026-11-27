---@meta

--[[
  CLX 生命周期回调。

  在 Lua 代码里定义这些顶层函数，运行时会在对应时机调用。它们都不是必需的：
  只画画面的卡带可以只定义 _draw。在这里声明是为了给出悬停说明与补全，
  避免被提示「未定义全局变量」。
]]

--- 应用加载后调用一次。在这里初始化变量、加载资源。
function _init() end

--- 应用激活时每帧调用。处理输入、更新游戏逻辑。
function _update() end

--- 应用激活时需要刷新画布时调用（在 _update 之后，基本每帧一次）。
function _draw() end

--- 应用处于后台 idle 时每帧调用。
function _idle_update() end

--- idle 状态下需要刷新画布时调用。
function _idle_draw() end

--- 配置界面激活时每帧调用。
function _cfg_update() end

--- 配置界面刷新画布时调用。
function _cfg_draw() end

---
--- 卡带作为后台服务加载后调用一次。
---
--- 后台服务是卡带的 __svc__ 区段，没有画面。
function _initsvc() end

--- 卡带作为后台服务运行时每帧调用。
function _updatesvc() end

---
--- 被监听的服务发布变更时调用（见 svcmon()）。
---@param seq number 服务事件本体里的序号
---@param name string 服务名
---@param path string 服务内的路径
function _svcind(seq, name, path) end

---
--- 应用运行状态切换（前台 / idle）时调用。
---@param stat number 新状态
---@param statname string 状态名
function _setstat(stat, statname) end
