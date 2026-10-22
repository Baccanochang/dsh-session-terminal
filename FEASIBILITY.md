# dsh-session-terminal 插件可行性分析

> 结论先行：**可行，且核心链路在同机已有可复用实现。**
> 但必须先接受一个语义前提：**CodeBuddy / Claude Code 不是 DSH 的"另一种会话类型"，而是一个挂在 DSH 会话下的终端进程。**
> 在这个前提下，MVP 约 **1–2 天**；做到"像原生会话一样"（独立侧栏条目、独立历史、可 fork/压缩）则**不是插件层能解决的**，见 §8。

分析环境：Windows / DSH Desktop / profile `desktop`。
本机已安装 `codebuddy` 与 `claude`（均在 `PATH` 中）。

---

## 1. 需求拆解

| # | 需求 | 实际含义 |
|---|---|---|
| 1 | 工作区新建会话时选择类型 | 在"新建会话"这一步多一个选择：DSH / CodeBuddy / Claude Code / 其它 |
| 2 | 会话在 cmd / bash / powershell 中实现 | 外部 CLI 跑在用户指定的 shell 里 |
| 3 | 可以直接弹出到右侧全屏 | 终端占据右侧栏并切到 fullscreen 模式 |

第 1 条有一个容易被忽略的语义分叉：

- **DSH 会话** = 有持久日志、有模型、有工具、能 fork/压缩/归档的 Agent 会话；
- **CodeBuddy / Claude Code 会话** = 一个外部 CLI 进程。DSH 不参与它的推理、工具、上下文与历史。

所以插件真正能交付的是：**"在这个工作区里，用哪个 Agent 干活"的启动器**，而不是给 DSH 增加一种新的会话实体。两者的差别贯穿全文。

---

## 2. 现有能力盘点（含证据）

| 能力 | 提供方 | 结论 |
|---|---|---|
| 新建/复用空白会话 | `ctx.uiWorkspace.startSession(workspaceId?, opts)`、`connectWorkspace(workspaceId)` → `SessionId`；`SessionSnapshot.blank` | ✅ 点 `+` 即存在一个空白 DSH 会话，可作为终端宿主 |
| 新建会话行的扩展位 | Client Slot `conversation.hero.options`（list / session 作用域 / `replaceRisk: none`，标准 props 含 `sessionId`） | ✅ 可安全追加"运行方式"控件，不覆盖官方 UI |
| 会话级 PTY | Host `ctx.terminals`（`spawn/read/startSend/signal/kill`，**owner: Agent**） | ✅ 终端天然归属某个会话 |
| 浏览器终端 | Client `ctx.webTerminals.view(sessionId, key, contentId, terminalId?, shellPath?)`（better-sidebar 源码 `src/client/terminal-client.ts`） | ✅ 可分配/复用/关闭终端，`view.write()` 可直接输入命令 |
| 官方终端标签 | 右侧栏 tab 类型 `@deepseek-ai/dsh-client-ui-sidebar-terminal` 已注册（`Slots.listSubTree` 实测） | ✅ 不需要自己实现 xterm |
| 打开右侧标签 | `ctx.sidebarRight.openTab(kind, opts)` / `openTabIn(sessionId, kind, opts)`（better-sidebar `native/surface.ts`） | ✅ 传 `params.terminalId` 即可让官方标签接管同一个 PTY |
| 右侧全屏 | `ctx.sidebarRight.commandTarget(anchor)` + `toggleFullscreen(target)`；另有 `ctx.layout.openRightbar(track, fullscreen)` | ✅ 前者是 dsh-tui-mode 的实测路径；后者语义待验证 |
| shell 发现 | Host `ctx.terminalController.shells(agent)` → `TerminalShell[]`（path/args/name） | ✅ 权威列表，避免硬编码 |
| 已有同类实现 | 同工作区 `agent-supporter`（`@local/dsh-tui-mode`）：`client.js` 的 `launchTool()` 已完整跑通"分配 PTY → 输入命令 → 开官方终端标签 → 切全屏" | ✅ 可直接复用/裁剪（注意：当前 profile 的 bundles 未包含它，未挂载，需复验） |

本机 shell 实测：`cmd.exe`、`WindowsPowerShell\v1.0\powershell.exe`、`bash`（dsh-ops 自带 Git Bash 与 `System32\bash.exe` 两个候选）、`wsl.exe`；**没有独立的 `pwsh`**。这正说明 shell 列表必须来自宿主发现，不能写死。

---

## 3. 三种架构方案

### 方案 A：启动器 + DSH 会话作容器（推荐）

在新建会话行加"运行方式"选择；选 CodeBuddy/Claude Code/其它时，在该空白会话的工作目录里分配 PTY、输入 CLI 命令、打开官方终端标签并全屏，同时把空白会话改名为 `CodeBuddy · <仓库名>`。

- 侧栏条目仍是 DSH 会话（可改名，观感接近）；
- 聊天区是空的，右侧是全屏终端；
- 风险低，完全走官方能力，无自建 PTY / 无 xterm 打包。

### 方案 B：自建"外部会话"列表

插件自己存一份外部会话注册表，并 shadow `sidebar.workspaces` 渲染第二组条目。

- 体验最接近"真正的会话类型"；
- 但 `sidebar.workspaces` 是 `replaceRisk: shadows-shipped-ui` 的单槽，等于重写整个侧栏浏览器，升级必坏；
- 还要自建持久化、排序、归档、搜索。**不建议。**

### 方案 C：ACP 一等公民

把 CodeBuddy（`codebuddy --acp`）作为 DSH 的 Agent/LlmAdapter 接进来，成为真正的 DSH 会话。

- 语义最正确，能进聊天流、能走 DSH 工具与审批；
- 但工作量大且语义不对等（见同工作区 `codebuddy-acp/ANALYSIS.md`：ACP 是"整轮 Agent 运行"，DSH `llm.stream()` 是"单次模型步"，历史/压缩/fork 会对不齐）；
- Claude Code 不原生说 ACP，还需要适配层；
- 且它**不是终端体验**，与本次需求方向不同。

| 维度 | A 启动器 | B 自建列表 | C ACP |
|---|---|---|---|
| 满足"选择类型" | ✅ | ✅✅ | ✅ |
| 终端/全屏 | ✅ | ✅ | ❌（聊天式） |
| 侧栏独立条目 | ⚠️ 近似 | ✅ | ✅ |
| 升级稳定性 | ✅ | ❌ | ⚠️ |
| 工作量 | 1–2 天 | 1–2 周 | 数周 |

**建议：先做 A 的 MVP；C 作为独立课题。**

---

## 4. 方案 A 详细设计

### 4.1 入口

1. **主入口（P1）**：`conversation.hero.options` 注册一个紧凑控件「运行方式：DSH ▾」。
   - 菜单项：DSH（默认）/ CodeBuddy / Claude Code / 其它（自定义命令）/ 纯终端。
   - 位置就在新建会话行的 workspace 与 preset 控件之后，符合"新建会话时选择"。
2. **全局入口（P2，可选）**：`sidebar.footer.action` 加一个「新建外部会话」按钮：先选工作区（`useWorkspaces`）→ 类型 → shell，再 `connectWorkspace(workspaceId)` 拿到 `SessionId` 并启动。
3. **兜底入口（P2）**：`conversation.session.header.actions` 加一个 `>_` 按钮，等价于 dsh-tui-mode，方便会话已开始后补开终端。

> 官方 `+` 按钮本身没有扩展槽；要"点 + 就弹选择框"只能 shadow `sidebar.workspaces`，代价同方案 B，**不做**。

### 4.2 启动流程

```js
// 伪代码：非 DSH 分支
const terminals = ctx.get('webTerminals')
const sidebar   = ctx.get('sidebarRight')

const view = terminals.view(sessionId, key, contentId, undefined, shellPath)
view.mount()
await waitWritable(view, 20000)          // 等 shell 就绪
await view.rename(`${tool.name} · ${repo}`)
view.write(tool.command + '\r')          // codebuddy / claude / 自定义
sidebar.openTab('terminal', { params: { terminalId: view.id } })
const target = sidebar.commandTarget(anchor)   // anchor = 控件 DOM
if (target) sidebar.toggleFullscreen(target)
await ctx.sessions.binding(sessionId)?.session.rename(`${tool.name} · ${repo}`)
```

要点：

- **先 `view()` 再 `openTab()`**：PTY 由 view 分配，标签只负责显示同一个 `terminalId`；启动器丢弃自己的流不会杀进程。
- **`openTab` 只对当前挂载的会话有效**；`openTabIn` 对未挂载会话是静默 no-op（better-sidebar 源码注释）。跨工作区启动必须先 `connectWorkspace` + 导航，等面板挂载后再开标签。
- **全屏**：优先 `sidebar.commandTarget` + `toggleFullscreen`（dsh-tui-mode 实测）；`ctx.layout.openRightbar(true, true)` 作为备选，需 P0 验证它到底是"设置"还是"上报"。
- **DSH 分支**：什么都不做，保留原生聊天；选择只影响非 DSH 分支。

### 4.3 shell 选择

- 首选：宿主 `terminalController.shells(agent)` 返回的权威列表（cmd / powershell / bash / wsl）。
- 传给 `view(..., shellPath)`；若宿主拒绝该路径，**回退到默认 shell**，再 `view.write(command)`——命令在哪种 shell 里都能执行，只是提示符不同。
- 注意 Windows 上 `bash` 有 Git Bash 与 WSL 两个候选，标签里要显示完整路径或来源，避免用户选错。

### 4.4 配置与记忆

MVP 用 `localStorage` 记住上次的"类型 + shell"；P2 再做插件配置页（工具列表、默认 shell、是否自动全屏、自定义命令）。工具清单默认：

```js
[
  { id: 'codebuddy', name: 'CodeBuddy', command: 'codebuddy' },
  { id: 'claude',    name: 'Claude Code', command: 'claude' },
]
```

### 4.5 失败与降级

| 情况 | 处理 |
|---|---|
| `webTerminals` / `sidebarRight` 缺席 | 菜单置灰 + 提示"当前组合未提供终端能力" |
| shell 未就绪超时 | 提示并保留已分配终端（可关闭标签释放） |
| `shellPath` 不被接受 | 回退默认 shell 重试一次 |
| CLI 未安装 | 终端里显示 shell 的"命令找不到"；P2 可用宿主 `subprocess.resolveExecutable` 预检 |
| 会话改名失败 | 忽略，仅影响侧栏标题 |
| 全屏切换失败 | 不视为启动失败，用户可手动点全屏按钮 |

---

## 5. 关键风险

1. **语义错位（最大风险，非技术）**：外部 CLI 不是 DSH 会话。历史、fork、压缩、模型选择、上下文都不共享；空白 DSH 会话会留在侧栏（改名可缓解）。若产品预期是"三种平级会话"，需要方案 B/C，成本高一个数量级。
2. **终端生命周期绑会话**：归档/删除会话会终止终端；页面刷新可由标签重连；Host 重启后不恢复。
3. **结构服务无类型契约**：`webTerminals`、`sidebarRight` 不在 `cordis_inspect` 的 Client Service 目录里，只能按名探测 + 能力检测 + 降级；DSH 升级可能改签名。
4. **`openTabIn` 的静默 no-op**：只对已挂载会话开标签，跨会话必须先导航。
5. **`shellPath` 未验证**：`view()` 的第 5 个参数在 better-sidebar 的类型里存在，但本机没有实际调用样例；需要 P0 实测。
6. **全屏 API 语义不明**：`layout.openRightbar` 的文档写的是 "Report … without changing its expanded state"，可能是内部上报而非命令；DOM 路径更稳但更脆。
7. **与 better-sidebar 共存**：它接管了 `rightbar.session` 并注册了十余个 tab 类型；官方 `terminal` 类型仍在，**不要**去 shadow 右侧栏，只追加 tab/入口。
8. **与官方能力重叠**：dsh-tui-mode 已做"会话内启动 TUI"；若 DSH 后续内置"新建会话选 Agent"，插件价值会被吸收。
9. **安全边界**：终端里的 CLI 不受 DSH 文件沙箱与审批约束（用户自己启动的进程）。这是预期行为，但文档要写明，避免误以为仍受 DSH 管控。

---

## 6. 分阶段计划

| 阶段 | 内容 | 工作量 |
|---|---|---|
| P0 spike | 验证 4 件事：hero 行能渲染并拿到 `sessionId`；`view(..., shellPath)` 生效；`openTab('terminal', {terminalId})` 接管；全屏两条路径至少一条可用 | 0.5 天 |
| P1 MVP | hero 控件 + 三个工具 + shell 选择 + 自动全屏 + 会话改名 + 失败提示 | 1–2 天 |
| P2 完善 | 全局入口、header 兜底、配置页、CLI 预检、i18n、图标、README | 2–3 天 |
| P3 可选 | 方案 C（ACP）或方案 B（自建列表） | 数周 |

P1 可以直接以 `agent-supporter/client.js` 为骨架：`launchTool()`、`waitForWritable()`、`enterFullscreen()` 三个函数几乎原样可用，主要新增"类型菜单 + shell 子菜单 + 改名 + hero 槽注册"。

---

## 7. 建议的插件形态

- 包名：`dsh-session-terminal`，单 bundle，Host 半只做形状/配置，Client 半承载 UI。
- 不改 profile 的 `package.json`/`cordis.patch.yml`，用 `plugin_manager.install_bundle` 安装。
- 不 import 任何 `@deepseek-ai/*` 值，不写宿主 DOM 样式；颜色走 `--dsw-alias-*` 令牌。
- 图标、中英文 locale、README 与 `dsh-tui-mode` 保持同一套规范。

---

## 8. 明确做不到（或代价极高）

1. **把 CodeBuddy/Claude Code 变成 DSH 原生会话**：需要 ACP 或 DSH 提供 session provider 抽象，插件层做不到。
2. **在没有任何 DSH 会话的情况下拥有内嵌终端**：`terminals`/`terminalController` 都以 `Agent` 为 owner。除非自建 PTY + WebSocket + xterm（方案 B 的变体），成本与风险都高。
3. **拦截官方 `+` 按钮**：没有对应 slot；只能并列加入口，或 shadow 整个侧栏。
4. **跨 DSH 版本稳定**：依赖的是结构服务（按名探测），升级需要回归。
5. **让终端输出进入 DSH 对话/上下文**：终端流与 Agent transcript 是两条通道；这是设计使然，不是缺陷。

---

## 9. P0 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|---|---|---|
| 1 | `conversation.hero.options` 在新建会话时渲染且带 `sessionId` | 注册一个最小控件打印 props | 点 `+` 后控件出现，`sessionId` 有效 |
| 2 | `view(sessionId, key, contentId, undefined, shellPath)` 接受 `cmd.exe` / `powershell.exe` / bash 路径 | 依次启动，观察 shell 提示符 | 三种 shell 都能起，失败时有明确错误 |
| 3 | `openTab('terminal', { params: { terminalId } })` 接管已分配 PTY | 启动后看标签内容 | 标签显示同一个终端，输入可用 |
| 4 | 全屏 | `commandTarget`+`toggleFullscreen`；再试 `layout.openRightbar(true,true)` | 面板覆盖整帧，可退出 |
| 5 | 会话改名 | `sessions.binding(id).session.rename()` | 侧栏标题变化，不影响终端 |
| 6 | 页面刷新 | F5 后重开标签 | 终端重连，进程仍在 |
| 7 | 未安装 CLI | 输入一个不存在的命令 | 终端显示 shell 报错，不崩溃 |

---

## 10. 一句话建议

**做，但按方案 A 做 MVP，并把产品预期写成"工作区里的 Agent 启动器"，而不是"DSH 的第三种会话"。**
真正平级的"CodeBuddy 会话"是 ACP 课题，不是这个插件的范围。