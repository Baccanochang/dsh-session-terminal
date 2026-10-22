# dsh-session-terminal

**新建会话时先选执行者，再创建会话**：

- **DSH 会话**：原生聊天、工具与历史；
- **CodeBuddy**：在真实终端里运行 `codebuddy`；
- **Claude Code**：在真实终端里运行 `claude`；
- **其它命令**：任意 CLI。

外部 CLI 在会话的当前工作目录中启动，终端可以是 **默认 / cmd / PowerShell / Bash**，在右侧栏打开并**自动最大化（全屏覆盖）**；退出全屏用终端面板标签栏右端的全屏按钮。

## 入口

只有官方 `+`：插件包装 `uiWorkspace.startSession`，点 `+` 时弹出选择框；取消则什么都不创建。没有额外的加号按钮。

## 非 DSH 会话如何常驻

DSH 的空白会话只是客户端草稿，切换后会从侧栏消失。插件在创建后：

1. 通过 `connectWorkspace`（workspace 感知）创建/复用会话并登记进工作区；
2. 用 `sessions.using()` 拿到已就绪的 binding；
3. **自动发一条初始用户消息**（`启动 CodeBuddy 终端会话。`）并立即取消回合 —— 会话因此非 blank，侧栏常驻；
4. 用 `session.rename()` 写入 `CodeBuddy · HH:MM` 作为显式标题（覆盖自动标题）；
5. `refreshProjections` 让客户端刷新标题；
6. 打开右侧栏官方终端标签，输入 CLI 命令，并把面板切到全屏。

## 前提

- 对应 CLI 已安装在 `PATH` 中并完成登录。
- 终端由 DSH 自带（`ctx.webTerminals`），本插件不自带 PTY、不打包 xterm。

## 边界

- CodeBuddy / Claude Code 是**外部 CLI**，不是 DSH 原生会话：历史、fork、压缩、模型选择、上下文都不共享。
- DSH 没有"纯终端会话"类型：终端必须挂在某个 Agent 会话下，所以侧栏里仍是一个 DSH 会话条目。
- 自动初始消息会在聊天区留下一条记录（常驻的代价），回合已取消。
- 终端进程归属于当前 DSH 会话：归档/删除会话会结束终端；页面刷新可由标签重连，Host 重启后不恢复。
- 终端里的 CLI 不受 DSH 文件沙箱与审批约束（用户自己启动的进程）。
- 官方 `+` 的拦截是包装客户端服务，不是官方扩展点；DSH 改签名时可能失效。

## 结构

| 文件 | 作用 |
|---|---|
| `cordis.patch.yml` | 插入 `dsh-session-terminal` 行 |
| `index.js` | Host 半，仅用于 bundle 形状与插件清单展示 |
| `client.js` | 浏览器模块：选择框（`shell.overlay`）、`startSession` 包装、建会话 + 初始消息 + 重命名 + PTY 启动 |
| `locale/*.json` | 插件管理页的标题与描述 |
| `icon.svg` | 插件图标 |