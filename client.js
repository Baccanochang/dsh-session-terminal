/**
 * dsh-session-terminal — browser half.
 *
 * A pre-creation chooser: picking the agent happens BEFORE a Session exists, so
 * a blank draft can never take the choice down with it when the user navigates
 * away. The official "+" (uiWorkspace.startSession) is wrapped to open the
 * chooser.
 *
 * DSH keeps the native chat. CodeBuddy / Claude Code / a custom command run in
 * a real Host PTY in the Session's working directory, typed into the official
 * terminal tab, which opens as a normal right-column tab (fullscreen is left to
 * the panel's own button).
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-terminal',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ------------------------------------------------------------------ i18n

    const DICT = {
      en: {
        'action.new': 'New session',
        'action.newTitle': 'Create a session and choose which agent runs in it',
        'modal.title': 'New session',
        'modal.subtitle': 'Choose which agent runs in this workspace session.',
        'modal.mode': 'Agent',
        'modal.dsh': 'DSH session',
        'modal.dshHint': 'Native chat, tools and history',
        'modal.codebuddyHint': 'Runs codebuddy in a terminal',
        'modal.claudeHint': 'Runs claude in a terminal',
        'modal.custom': 'Custom command',
        'modal.customHint': 'Any CLI, e.g. opencode',
        'modal.customPlaceholder': 'command to run, e.g. codebuddy',
        'modal.shell': 'Terminal shell',
        'modal.cancel': 'Cancel',
        'modal.create': 'Create',
        'modal.creating': 'Creating…',
        'modal.workspace': 'Workspace',
        'modal.workspaceCurrent': 'Current workspace',
        'shell.default': 'Default',
        'state.starting': 'Starting {name}…',
        'error.unavailable': 'This composition does not provide the terminal service.',
        'error.timeout': 'The shell did not become ready in time.',
        'error.method': 'The terminal could not be opened.',
        'error.noCommand': 'Enter a command first.',
        'error.create': 'The session could not be created.',
        'error.workspace': 'The workspace session could not be opened.',
      },
      zh: {
        'action.new': '新建会话',
        'action.newTitle': '新建会话并选择在这个工作区里运行的 Agent',
        'modal.title': '新建会话',
        'modal.subtitle': '选择在这个工作区会话里运行的 Agent。',
        'modal.mode': '执行者',
        'modal.dsh': 'DSH 会话',
        'modal.dshHint': '原生聊天、工具与历史',
        'modal.codebuddyHint': '在终端中运行 codebuddy',
        'modal.claudeHint': '在终端中运行 claude',
        'modal.custom': '其它命令',
        'modal.customHint': '任意 CLI，例如 opencode',
        'modal.customPlaceholder': '要运行的命令，例如 codebuddy',
        'modal.shell': '终端 Shell',
        'modal.cancel': '取消',
        'modal.create': '创建',
        'modal.creating': '正在创建…',
        'modal.workspace': '工作区',
        'modal.workspaceCurrent': '当前工作区',
        'shell.default': '默认',
        'state.starting': '正在启动 {name}…',
        'error.unavailable': '当前组合没有提供终端服务。',
        'error.timeout': 'Shell 未在预期时间内就绪。',
        'error.method': '无法打开终端。',
        'error.noCommand': '请先输入命令。',
        'error.create': '会话创建失败。',
        'error.workspace': '无法打开工作区会话。',
      },
    }

    let lang = 'zh'
    const langListeners = new Set()

    function setLang(next) {
      if (!next || next === lang) return
      lang = next
      for (const listener of langListeners) listener()
    }

    function subscribeLang(listener) {
      langListeners.add(listener)
      return () => { langListeners.delete(listener) }
    }

    function useLang() {
      return React.useSyncExternalStore(subscribeLang, () => lang, () => lang)
    }

    function t(key, vars) {
      const dict = lang.toLowerCase().startsWith('en') ? DICT.en : DICT.zh
      let text = dict[key]
      if (text === undefined) text = DICT.zh[key]
      if (text === undefined) return key
      if (vars) {
        text = text.replace(/\{(\w+)\}/g, (match, name) => {
          const value = vars[name]
          return value === undefined || value === null ? match : String(value)
        })
      }
      return text
    }

    // -------------------------------------------------------------- constants

    const STORAGE_SHELL = 'dsh-session-terminal:shell'
    const STORAGE_MODE = 'dsh-session-terminal:mode'

    const DSH = { id: 'dsh', name: 'DSH' }

    const TOOLS = [
      { id: 'codebuddy', name: 'CodeBuddy', command: 'codebuddy', hintKey: 'modal.codebuddyHint' },
      { id: 'claude', name: 'Claude Code', command: 'claude', hintKey: 'modal.claudeHint' },
    ]

    const SHELLS = [
      { id: 'default', labelKey: 'shell.default', path: undefined },
      { id: 'cmd', label: 'cmd', path: 'C:\\Windows\\System32\\cmd.exe' },
      { id: 'powershell', label: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
      { id: 'bash', label: 'Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe' },
    ]

    function shellById(id) {
      for (const shell of SHELLS) if (shell.id === id) return shell
      return SHELLS[0]
    }

    function shellCandidates(shell) {
      if (!shell.path) return [undefined]
      if (shell.id === 'bash') return [shell.path, 'C:\\Windows\\System32\\bash.exe']
      return [shell.path]
    }

    function shellLabel(shell) {
      return shell.labelKey ? t(shell.labelKey) : shell.label
    }

    function toolById(id) {
      for (const tool of TOOLS) if (tool.id === id) return tool
      return undefined
    }

    function readStored(key) {
      try {
        return window.localStorage.getItem(key)
      } catch (_error) {
        return null
      }
    }

    function writeStored(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch (_error) { /* storage unavailable */ }
    }

    function initialShell() {
      return shellById(readStored(STORAGE_SHELL) || 'default')
    }

    function initialMode() {
      const stored = readStored(STORAGE_MODE)
      if (stored === 'dsh' || stored === 'custom') return stored
      if (toolById(stored)) return stored
      return 'dsh'
    }

    // ---------------------------------------------------------------- helpers

    function delay(ms) {
      return new Promise(resolve => { setTimeout(resolve, ms) })
    }

    function newId() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
      } catch (_error) { /* fall through */ }
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
    }

    function clock() {
      const now = new Date()
      const pad = value => (value < 10 ? '0' : '') + value
      return pad(now.getHours()) + ':' + pad(now.getMinutes())
    }

    function firstToken(command) {
      const token = String(command || '').trim().split(/\s+/)[0]
      return token.length > 0 ? token : 'Terminal'
    }

    function waitWritable(view, timeoutMs) {
      return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs
        let timer
        const settle = (fn, value) => {
          if (timer !== undefined) {
            clearInterval(timer)
            timer = undefined
          }
          fn(value)
        }
        const check = () => {
          let state
          try {
            state = view.state && typeof view.state.getSnapshot === 'function'
              ? view.state.getSnapshot()
              : undefined
          } catch (_error) {
            state = undefined
          }
          if (state && state.writable && state.info) {
            settle(resolve, undefined)
            return true
          }
          if (state && (state.phase === 'failed' || state.phase === 'closed')) {
            settle(reject, new Error(state.error || state.phase))
            return true
          }
          if (Date.now() > deadline) {
            settle(reject, new Error('timeout'))
            return true
          }
          return false
        }
        if (check()) return
        timer = setInterval(check, 100)
      })
    }

    function disposeView(view) {
      try {
        if (view && typeof view.dispose === 'function') void view.dispose()
      } catch (_error) { /* already gone */ }
    }

    function closeView(terminals, sessionId, key, view) {
      try {
        if (terminals && typeof terminals.close === 'function') {
          terminals.close(sessionId, key, key, view && view.id)
        }
      } catch (_error) { /* already gone */ }
    }

    function isFullscreen(sessionId) {
      if (typeof window !== 'undefined' && window.innerWidth < 768) return true
      if (typeof document === 'undefined') return false
      const owner = document.querySelector('[data-sidebar-right-session="' + String(sessionId) + '"]')
      const panel = owner === null ? null : owner.querySelector('[data-sidebar-right-panel]')
      return panel !== null && panel.getAttribute('data-sidebar-right-panel') === 'fullscreen'
    }

    function enterFullscreen(sidebar, sessionId, anchor) {
      if (isFullscreen(sessionId)) return
      if (typeof sidebar.commandTarget !== 'function' || typeof sidebar.toggleFullscreen !== 'function') return
      const target = sidebar.commandTarget(anchor)
      if (target === undefined || target === null) return
      sidebar.toggleFullscreen(target)
    }

    async function openView(terminals, sessionId, shellPath) {
      const key = 'dsh-session-terminal:' + newId()
      const view = terminals.view(sessionId, key, key, undefined, shellPath)
      view.mount()
      try {
        await waitWritable(view, 20000)
      } catch (error) {
        disposeView(view)
        throw error
      }
      return { view, key }
    }

    async function allocate(terminals, sessionId, shell) {
      const candidates = shellCandidates(shell)
      let lastError
      for (const path of candidates) {
        try {
          return await openView(terminals, sessionId, path)
        } catch (error) {
          lastError = error
        }
      }
      throw lastError || new Error('timeout')
    }

    /**
     * Allocate a PTY in the Session directory, type the command, and hand the
     * same Host terminal identity to the official sidebar terminal tab.
     */
    async function launch(ctx, sessionId, tool, anchor, shell) {
      const terminals = ctx.get('webTerminals')
      const sidebar = ctx.get('sidebarRight')
      if (!terminals || typeof terminals.view !== 'function') throw new Error(t('error.unavailable'))
      if (!sidebar || (typeof sidebar.openTab !== 'function' && typeof sidebar.openTabIn !== 'function')) {
        throw new Error(t('error.unavailable'))
      }

      let allocated = null
      try {
        try {
          allocated = await allocate(terminals, sessionId, shell)
        } catch (error) {
          if (!shell.path) throw error
          allocated = await allocate(terminals, sessionId, SHELLS[0])
        }

        const view = allocated.view
        try {
          if (typeof view.rename === 'function') await view.rename(tool.name)
        } catch (_error) { /* the tab falls back to the shell title */ }
        await delay(200)
        view.write(tool.command + '\r')
        await delay(300)

        const options = { params: { terminalId: view.id } }
        const mounted = sidebar.mounted && typeof sidebar.mounted.getSnapshot === 'function'
          ? sidebar.mounted.getSnapshot()
          : undefined
        if (mounted === sessionId && typeof sidebar.openTab === 'function') {
          sidebar.openTab('terminal', options)
        } else if (typeof sidebar.openTabIn === 'function') {
          sidebar.openTabIn(sessionId, 'terminal', options)
        } else if (typeof sidebar.openTab === 'function') {
          sidebar.openTab('terminal', options)
        }

        // The terminal opens as a normal right-column tab. Fullscreen is NOT
        // entered automatically — it covers the whole frame and reads poorly;
        // the panel's own fullscreen button is still there when wanted.

        // The Host process outlives this client attachment: the tab adopted the
        // same identity, so dropping the launcher's stream never kills it.
        disposeView(view)
        allocated = null
      } finally {
        if (allocated) {
          closeView(terminals, sessionId, allocated.key, allocated.view)
          disposeView(allocated.view)
        }
      }
    }

    /**
     * Run one operation against a retained Session binding. `sessions.using`
     * acquires a reference and releases it after the callback settles, so the
     * binding is guaranteed ready (`ref.ready`) instead of polled.
     */
    async function withBinding(ctx, sessionId, operation) {
      const sessions = ctx.get('sessions')
      if (!sessions || typeof sessions.using !== 'function') return false
      try {
        await sessions.using(sessionId, { source: 'controllerOperation' }, async reference => {
          const binding = await reference.ready
          const face = binding && binding.session
          if (face) await operation(face)
        })
        return true
      } catch (error) {
        try { console.error('[dsh-session-terminal] session operation failed', error) } catch (_ignored) { /* no console */ }
        return false
      }
    }

    /**
     * Give the Session one durable user message and immediately cancel the
     * model turn. A blank Session is only a client draft (the sidebar drops it
     * on navigation); one user message makes it a persistent row.
     */
    async function seedSession(ctx, sessionId, toolName) {
      const text = '启动 ' + toolName + ' 终端会话。'
      const ok = await withBinding(ctx, sessionId, async face => {
        if (typeof face.prompt !== 'function') return
        const result = await face.prompt([{ type: 'text', text }], 'queue')
        if (result && result.ok === false) {
          try { console.error('[dsh-session-terminal] seed prompt rejected', result.error) } catch (_ignored) {}
        }
        // Let the admitted prompt become an active turn before cancelling, so
        // the message stays durable while the model request is aborted.
        await delay(250)
        try {
          if (typeof face.cancel === 'function') await face.cancel()
        } catch (_error) { /* the turn may already be settled */ }
      })
      if (!ok) {
        // Fallback: the Host Remote admits the prompt without a client binding.
        try {
          const remote = ctx.remote && ctx.remote.session
          if (remote && typeof remote.prompt === 'function') {
            await remote.prompt({
              requestId: 'dsh-session-terminal-' + newId(),
              sessionId,
              mode: 'queue',
              content: [{ type: 'text', text }],
            })
            if (typeof remote.cancel === 'function') {
              try { remote.cancel({ sessionId }) } catch (_error) {}
            }
            return true
          }
        } catch (error) {
          try { console.error('[dsh-session-terminal] seed failed', error) } catch (_ignored) {}
        }
      }
      return ok
    }

    /**
     * Pin an explicit user title after the seed message. An explicit rename
     * supersedes the automatic title generation a first prompt would trigger.
     */
    async function renameSession(ctx, sessionId, name) {
      const title = name + ' · ' + clock()
      const ok = await withBinding(ctx, sessionId, async face => {
        if (typeof face.rename === 'function') await face.rename(title)
      })
      if (ok) return
      try {
        const remote = ctx.remote && ctx.remote.session
        if (remote && typeof remote.rename === 'function') await remote.rename({ sessionId, title })
      } catch (error) {
        try { console.error('[dsh-session-terminal] rename failed', error) } catch (_ignored) { /* no console */ }
      }
    }

    /** Best-effort pin so the session is surfaced before its first message. */
    async function pinSession(ctx, sessionId) {
      try {
        const remote = ctx.remote
        const workspace = remote && remote.workspace
        if (workspace && typeof workspace.pinSession === 'function') {
          await workspace.pinSession({ sessionId })
        }
      } catch (_error) { /* pinning is best-effort */ }
    }

    function currentSessionId(ctx) {
      try {
        const sidebar = ctx.get('sidebarRight')
        const mounted = sidebar && sidebar.mounted
        return mounted && typeof mounted.getSnapshot === 'function' ? mounted.getSnapshot() : undefined
      } catch (_error) {
        return undefined
      }
    }

    function currentCwd(ctx, sessionId) {
      try {
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function'
          ? sessions.list.getSnapshot()
          : undefined
        const summary = list && list.byId ? list.byId[sessionId] : undefined
        return summary && typeof summary.cwd === 'string' ? summary.cwd : undefined
      } catch (_error) {
        return undefined
      }
    }

    function openSession(ctx, sessionId) {
      try {
        const sessions = ctx.get('sessions')
        if (sessions && typeof sessions.open === 'function') sessions.open(sessionId)
      } catch (_error) { /* try the workspace face */ }
      try {
        const ui = ctx.get('uiWorkspace')
        if (ui && typeof ui.openSession === 'function') ui.openSession(sessionId)
      } catch (_error) { /* the caller still gets the id */ }
    }

    /**
     * Best-effort accounting: ensure the Session appears in the owning
     * Workspace's sessionIds so the sidebar lists it while it is still blank.
     */
    async function accountSession(ctx, location, sessionId) {
      if (!location || !location.workspaceId || !sessionId) return
      try {
        const workspaces = ctx.get('workspaces')
        if (workspaces && typeof workspaces.insertSessionBefore === 'function') {
          await workspaces.insertSessionBefore(location.workspaceId, sessionId)
        }
      } catch (_error) { /* connectWorkspace already accounts; this is belt-and-suspenders */ }
    }

    /**
     * The sidebar title comes from the client's cached Session projections;
     * after a rename the host projection is ahead of what the client list
     * holds, so force a re-read to make the new title show up.
     */
    async function refreshSessionProjections(ctx, sessionId) {
      try {
        const sessions = ctx.get('sessions')
        if (sessions && typeof sessions.refreshProjections === 'function') {
          await sessions.refreshProjections(sessionId)
        }
      } catch (_error) { /* best-effort */ }
    }

    function readSessionIds(sessions) {
      try {
        const list = sessions && sessions.list
        const snapshot = list && typeof list.getSnapshot === 'function' ? list.getSnapshot() : undefined
        return snapshot && Array.isArray(snapshot.ids) ? snapshot.ids : []
      } catch (_error) {
        return []
      }
    }

    async function waitNewSession(sessions, before, mounted, previous, timeoutMs) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const ids = readSessionIds(sessions)
        for (const id of ids) {
          if (!before.has(id)) return id
        }
        if (mounted && typeof mounted.getSnapshot === 'function') {
          const current = mounted.getSnapshot()
          if (current && current !== previous) return current
        }
        await delay(60)
      }
      return undefined
    }

    async function waitMounted(ctx, sessionId) {
      const sidebar = ctx.get('sidebarRight')
      const mounted = sidebar && sidebar.mounted
      if (!mounted || typeof mounted.getSnapshot !== 'function') {
        await delay(500)
        return
      }
      const deadline = Date.now() + 3000
      let retried = false
      while (Date.now() < deadline) {
        if (mounted.getSnapshot() === sessionId) return
        // The client list may not have adopted the Host-created Session on the
        // first navigation attempt; ask again once the list has settled.
        if (!retried && Date.now() > deadline - 2600) {
          openSession(ctx, sessionId)
          retried = true
        }
        await delay(50)
      }
    }

    // ------------------------------------------------------- chooser + patch

    const PATCH_KEY = typeof Symbol === 'function'
      ? Symbol.for('dsh-session-terminal.uiWorkspace')
      : '__codebuddySessionPatched'

    let chooserRequest = null
    const chooserListeners = new Set()
    let chooserHostMounted = false
    let anchorElement = null
    let originalStartSession = null
    let patchedWrapper = null

    function emitChooser() {
      for (const listener of chooserListeners) listener()
    }

    function subscribeChooser(listener) {
      chooserListeners.add(listener)
      return () => { chooserListeners.delete(listener) }
    }

    function openChooser(request) {
      chooserRequest = request
      emitChooser()
    }

    function closeChooser() {
      chooserRequest = null
      emitChooser()
    }

    function installPatch(ctx) {
      const ui = ctx.get('uiWorkspace')
      if (!ui || typeof ui.startSession !== 'function') return false

      // A hot reload leaves the previous generation's wrapper in place; unwrap
      // it so the new generation keeps calling the real original.
      const current = ui.startSession
      let original
      if (current && current.__codebuddyOriginal) {
        original = current.__codebuddyOriginal
      } else if (ui[PATCH_KEY]) {
        return false
      } else {
        original = current.bind(ui)
      }

      const wrapper = function (workspaceId, options) {
        if (!chooserHostMounted) {
          original(workspaceId, options)
          return
        }
        openChooser({ workspaceId, options, original })
      }
      wrapper.__codebuddyOriginal = original

      try {
        ui.startSession = wrapper
        ui[PATCH_KEY] = true
      } catch (_error) {
        return false
      }
      originalStartSession = original
      patchedWrapper = wrapper
      return true
    }

    /**
     * Run the unpatched official new-session path. A request carrying its own
     * `original` came through the wrapper; the footer entry and the external
     * "no workspace id" branch use the saved original instead, so they can
     * never re-enter the chooser.
     */
    function startDshSession(ctx, workspaceId, options, requestOriginal) {
      if (typeof requestOriginal === 'function') {
        requestOriginal(workspaceId, options)
        return
      }
      if (originalStartSession) {
        originalStartSession(workspaceId, options)
        return
      }
      const ui = ctx.get('uiWorkspace')
      if (ui && typeof ui.startSession === 'function') ui.startSession(workspaceId, options)
    }

    async function createSessionFor(ctx, location, options, requestOriginal) {
      const sessions = ctx.get('sessions')
      const remote = ctx.remote && ctx.remote.session
      const reasons = []
      const short = (error) => String((error && error.message) || error).slice(0, 80)

      // The workspace-aware path: it accounts the Session in the Workspace's
      // sessionIds, so the sidebar lists it even while it is still blank.
      const ui = ctx.get('uiWorkspace')
      if (ui && location && location.workspaceId && typeof ui.connectWorkspace === 'function') {
        try {
          const sessionId = await ui.connectWorkspace(location.workspaceId, options)
          if (sessionId) {
            try { console.log('[dsh-session-terminal] created via connectWorkspace', sessionId) } catch (_ignored) {}
            openSession(ctx, sessionId)
            return sessionId
          }
          reasons.push('connectWorkspace: no id')
        } catch (error) {
          reasons.push('connectWorkspace: ' + short(error))
          try { console.error('[dsh-session-terminal] connectWorkspace failed', error) } catch (_ignored) {}
        }
      } else {
        reasons.push('no connectWorkspace (workspaceId=' + (location && location.workspaceId) + ')')
      }

      const request = {}
      if (location && location.workspaceId) request.workspaceId = location.workspaceId
      if (location && location.cwd) request.cwd = location.cwd
      if (options && options.agentPreset) request.agentPreset = options.agentPreset

      if (sessions && typeof sessions.create === 'function') {
        try {
          const sessionId = await sessions.create(request)
          if (sessionId) {
            try { console.log('[dsh-session-terminal] created via sessions.create', sessionId) } catch (_ignored) {}
            accountSession(ctx, location, sessionId)
            openSession(ctx, sessionId)
            return sessionId
          }
          reasons.push('sessions.create: no id')
        } catch (error) {
          reasons.push('sessions.create: ' + short(error))
          try { console.error('[dsh-session-terminal] sessions.create failed', error) } catch (_ignored) {}
        }
      } else {
        reasons.push('no sessions.create')
      }

      if (remote && typeof remote.create === 'function') {
        try {
          const value = await remote.create(request)
          const sessionId = value && value.sessionId
          if (sessionId) {
            try { console.log('[dsh-session-terminal] created via remote.session.create', sessionId) } catch (_ignored) {}
            accountSession(ctx, location, sessionId)
            openSession(ctx, sessionId)
            return sessionId
          }
          reasons.push('remote.create: no id')
        } catch (error) {
          reasons.push('remote.create: ' + short(error))
          try { console.error('[dsh-session-terminal] remote.create failed', error) } catch (_ignored) {}
        }
      } else {
        reasons.push('no remote.create')
      }

      if (!ui) throw new Error(t('error.unavailable'))

      const before = new Set(readSessionIds(sessions))
      const sidebar = ctx.get('sidebarRight')
      const mounted = sidebar && sidebar.mounted
      const previous = mounted && typeof mounted.getSnapshot === 'function' ? mounted.getSnapshot() : undefined
      startDshSession(ctx, undefined, options, requestOriginal)
      const created = await waitNewSession(sessions, before, mounted, previous, 4000)
      if (created) return created

      // The official flow reuses the first blank member, so an unchanged
      // mounted Session is still the right place to run the terminal.
      const current = mounted && typeof mounted.getSnapshot === 'function' ? mounted.getSnapshot() : undefined
      if (current && isBlankSession(ctx, current)) return current
      throw new Error(t('error.create') + ' [' + reasons.join(' | ').slice(0, 200) + ']')
    }

    function isBlankSession(ctx, sessionId) {
      try {
        const sessions = ctx.get('sessions')
        if (!sessions || typeof sessions.binding !== 'function') return false
        const binding = sessions.binding(sessionId)
        const face = binding && binding.session
        const snapshot = face && typeof face.getSnapshot === 'function' ? face.getSnapshot() : undefined
        return !!(snapshot && snapshot.blank)
      } catch (_error) {
        return false
      }
    }

    // -------------------------------------------------------------------- ui

    const CSS = [
      '.cbs-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.38);pointer-events:auto;}',
      '.cbs-dialog{pointer-events:auto;width:468px;max-width:calc(100vw - 32px);max-height:calc(100vh - 64px);overflow:auto;padding:18px 18px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 24px 64px rgba(0,0,0,.32);color:var(--dsw-alias-label-primary);}',
      '.cbs-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px;}',
      '.cbs-dialog-title{font-size:15px;font-weight:600;line-height:1.3;}',
      '.cbs-dialog-close{width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:15px;line-height:1;cursor:pointer;}',
      '.cbs-dialog-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.cbs-dialog-sub{margin:0 0 14px;font-size:12px;color:var(--dsw-alias-label-tertiary);}',
      '.cbs-label{display:block;margin:12px 0 6px;font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.cbs-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '.cbs-card{display:flex;flex-direction:column;gap:3px;padding:10px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;}',
      '.cbs-card:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.cbs-card.is-active{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover);}',
      '.cbs-card-title{font-size:12.5px;font-weight:500;}',
      '.cbs-card-hint{font-size:10.5px;color:var(--dsw-alias-label-tertiary);line-height:1.35;}',
      '.cbs-shells{display:flex;flex-wrap:wrap;gap:6px;}',
      '.cbs-chip{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;}',
      '.cbs-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.cbs-chip.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);}',
      '.cbs-input{width:100%;height:30px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;box-sizing:border-box;}',
      '.cbs-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}',
      '.cbs-dialog-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:18px;}',
      '.cbs-btn{height:30px;padding:0 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;}',
      '.cbs-btn:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.cbs-btn:disabled{opacity:.55;cursor:default;}',
      '.cbs-btn-primary{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill);color:#fff;}',
      '.cbs-btn-primary:hover{background:var(--dsw-alias-button-primary-hover);border-color:var(--dsw-alias-button-primary-hover);}',
      '.cbs-error{margin-top:10px;font-size:11px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;}',
      '.cbs-busy{margin-top:10px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.cbs-anchor{position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;}',
    ].join('\n')

    function StyleTag() {
      return h('style', null, CSS)
    }

    function ChooserHost(props) {
      useLang()
      const request = React.useSyncExternalStore(subscribeChooser, () => chooserRequest, () => null)
      const anchorRef = React.useRef(null)

      React.useEffect(() => {
        chooserHostMounted = true
        return () => { chooserHostMounted = false }
      }, [])

      React.useEffect(() => {
        anchorElement = anchorRef.current
        return () => { anchorElement = null }
      }, [])

      return h(React.Fragment, null,
        h('span', { className: 'cbs-anchor', ref: anchorRef, 'aria-hidden': 'true' }),
        request ? h(ChooserDialog, { ...props, request }) : null)
    }

    const identity = value => value

    function workspaceItems(snapshot) {
      if (!snapshot) return []
      if (Array.isArray(snapshot.items)) return snapshot.items
      if (snapshot.byId && Array.isArray(snapshot.ids)) {
        return snapshot.ids.map(id => snapshot.byId[id]).filter(Boolean)
      }
      if (Array.isArray(snapshot.workspaces)) return snapshot.workspaces
      return []
    }

    function resolveWorkspaceId(snapshot, cwd, currentSessionId) {
      const items = workspaceItems(snapshot)
      if (!items.length) return undefined
      const norm = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      if (cwd) {
        const target = norm(cwd)
        const found = items.find(item => item && item.path && norm(item.path) === target)
        if (found && found.workspaceId) return found.workspaceId
      }
      if (currentSessionId) {
        const found = items.find(item => item && Array.isArray(item.sessionIds)
          && item.sessionIds.indexOf(currentSessionId) >= 0)
        if (found && found.workspaceId) return found.workspaceId
      }
      const sorted = items.slice().sort((a, b) =>
        String(b && b.updatedAt || '').localeCompare(String(a && a.updatedAt || '')))
      return sorted[0] && sorted[0].workspaceId
    }

    function ChooserDialog(props) {
      useLang()
      const ctx = props.ctx
      const request = props.request
      // Standard prop on the overlay slot; used to resolve the workspace id
      // when the official "+" did not pass one.
      const workspacesSnapshot = typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces(identity)
        : undefined
      const [mode, setMode] = React.useState(initialMode)
      const [shell, setShell] = React.useState(initialShell)
      const [custom, setCustom] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape' && busy.length === 0) closeChooser()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [busy])

      const choose = next => {
        if (busy.length > 0) return
        setMode(next)
        writeStored(STORAGE_MODE, next)
        setError('')
      }

      const confirm = async () => {
        if (busy.length > 0) return
        if (mode === 'custom' && custom.trim().length === 0) {
          setError(t('error.noCommand'))
          return
        }
        const tool = mode === 'custom'
          ? { id: 'custom', name: firstToken(custom), command: custom.trim() }
          : toolById(mode)
        setBusy(mode === 'dsh' ? 'DSH' : tool.name)
        setError('')
        try {
          if (mode === 'dsh') {
            startDshSession(ctx, request.workspaceId, request.options, request.original)
            closeChooser()
            return
          }
          writeStored(STORAGE_SHELL, shell.id)
          const mountedBefore = currentSessionId(ctx)
          const cwd = mountedBefore ? currentCwd(ctx, mountedBefore) : undefined
          const location = {
            workspaceId: request.workspaceId || resolveWorkspaceId(workspacesSnapshot, cwd, mountedBefore),
            cwd,
          }
          const sessionId = await createSessionFor(ctx, location, request.options, request.original)
          // A blank Session is only a client draft; one durable user message
          // makes it a persistent sidebar row. The model turn is cancelled
          // immediately, so only the message stays.
          await seedSession(ctx, sessionId, tool.name)
          // Pin the explicit title AFTER the seed, superseding the automatic
          // title generation a first prompt triggers.
          await renameSession(ctx, sessionId, tool.name)
          await refreshSessionProjections(ctx, sessionId)
          await pinSession(ctx, sessionId)
          await waitMounted(ctx, sessionId)
          await launch(ctx, sessionId, tool, anchorElement || document.body, shell)
          closeChooser()
        } catch (failure) {
          const message = failure && failure.message ? failure.message : String(failure)
          setError(message === 'timeout' ? t('error.timeout') : message)
        } finally {
          setBusy('')
        }
      }

      const isTerminal = mode !== 'dsh'

      return h('div', {
        className: 'cbs-backdrop',
        onMouseDown: event => {
          if (event.target === event.currentTarget && busy.length === 0) closeChooser()
        },
      },
        h('div', {
          className: 'cbs-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('modal.title'),
          onMouseDown: event => event.stopPropagation(),
        },
          h(StyleTag),
          h('div', { className: 'cbs-dialog-head' },
            h('div', { className: 'cbs-dialog-title' }, t('modal.title')),
            h('button', {
              type: 'button',
              className: 'cbs-dialog-close',
              'aria-label': t('modal.cancel'),
              disabled: busy.length > 0,
              onClick: () => closeChooser(),
            }, '×')),
          h('p', { className: 'cbs-dialog-sub' }, t('modal.subtitle')),

          h('span', { className: 'cbs-label' }, t('modal.mode')),
          h('div', { className: 'cbs-grid' },
            h(ModeCard, {
              active: mode === 'dsh',
              title: t('modal.dsh'),
              hint: t('modal.dshHint'),
              onClick: () => choose('dsh'),
            }),
            TOOLS.map(tool => h(ModeCard, {
              key: tool.id,
              active: mode === tool.id,
              title: tool.name,
              hint: t(tool.hintKey),
              onClick: () => choose(tool.id),
            })),
            h(ModeCard, {
              active: mode === 'custom',
              title: t('modal.custom'),
              hint: t('modal.customHint'),
              onClick: () => choose('custom'),
            })),

          mode === 'custom'
            ? h('div', null,
              h('span', { className: 'cbs-label' }, t('modal.custom')),
              h('input', {
                className: 'cbs-input',
                value: custom,
                placeholder: t('modal.customPlaceholder'),
                spellCheck: false,
                disabled: busy.length > 0,
                autoFocus: true,
                onChange: event => { setCustom(event.target.value) },
                onKeyDown: event => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  void confirm()
                },
              }))
            : null,

          isTerminal
            ? h('div', null,
              h('span', { className: 'cbs-label' }, t('modal.shell')),
              h('div', { className: 'cbs-shells' },
                SHELLS.map(item => h('button', {
                  key: item.id,
                  type: 'button',
                  className: 'cbs-chip' + (shell.id === item.id ? ' is-active' : ''),
                  disabled: busy.length > 0,
                  onClick: () => { setShell(item) },
                }, shellLabel(item)))))
            : null,

          busy.length > 0
            ? h('div', { className: 'cbs-busy' }, t('state.starting', { name: busy }))
            : null,
          error.length > 0 ? h('div', { className: 'cbs-error' }, error) : null,

          h('div', { className: 'cbs-dialog-foot' },
            h('button', {
              type: 'button',
              className: 'cbs-btn',
              disabled: busy.length > 0,
              onClick: () => closeChooser(),
            }, t('modal.cancel')),
            h('button', {
              type: 'button',
              className: 'cbs-btn cbs-btn-primary',
              disabled: busy.length > 0,
              onClick: () => { void confirm() },
            }, busy.length > 0 ? t('modal.creating') : t('modal.create')))))
    }

    function ModeCard(props) {
      return h('button', {
        type: 'button',
        className: 'cbs-card' + (props.active ? ' is-active' : ''),
        onClick: props.onClick,
      },
        h('span', { className: 'cbs-card-title' }, props.title),
        h('span', { className: 'cbs-card-hint' }, props.hint))
    }

    // ---------------------------------------------------------------- plugin

    return {
      inject: ['slots', 'remote', 'remote.session'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale && typeof locale.getLocale === 'function') {
          try {
            const snapshot = locale.getLocale()
            setLang(String((snapshot && snapshot.active) || ''))
          } catch (_error) { /* keep the default language */ }
          if (typeof locale.subscribe === 'function') {
            ctx.effect(() => locale.subscribe(() => {
              try {
                const snapshot = locale.getLocale()
                setLang(String((snapshot && snapshot.active) || ''))
              } catch (_error) { /* keep the current language */ }
            }))
          }
        }

        function BoundHost(props) {
          return h(ChooserHost, { ...props, ctx })
        }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'codebuddy-chooser',
          order: 50,
        }, BoundHost))

        // The official "+" has no slot: wrap the client service it calls. The
        // wrapper is restored on dispose; when the service is not writable the
        // footer entry above still opens the same chooser.
        ctx.effect(() => {
          let timer
          let attempts = 0
          const stop = () => {
            if (timer !== undefined) {
              clearInterval(timer)
              timer = undefined
            }
          }
          const attempt = () => {
            if (installPatch(ctx)) {
              stop()
              return true
            }
            attempts += 1
            if (attempts >= 40) stop()
            return false
          }
          if (!attempt()) timer = setInterval(attempt, 500)
          return () => {
            stop()
            try {
              const ui = ctx.get('uiWorkspace')
              if (ui && ui[PATCH_KEY] && patchedWrapper && ui.startSession === patchedWrapper) {
                delete ui[PATCH_KEY]
                if (originalStartSession) ui.startSession = originalStartSession
              }
            } catch (_error) { /* the service kept its own binding */ }
            patchedWrapper = null
            originalStartSession = null
          }
        })
      },
    }
  },
})