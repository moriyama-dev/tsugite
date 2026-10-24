import { Component, Input, ViewChild, ElementRef, NgZone, HostBinding } from '@angular/core'
import { Subscription } from 'rxjs'
import { auditTime } from 'rxjs/operators'
import {
    AppService, AssistActivityService, AssistState, BaseComponent, ConfigService, HostAppService, HostWindowService,
    NotificationsService, Platform, PlatformService, SelectorService, SplitTabComponent, TranslateService,
} from 'tabby-core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'

/** One prompt sent from the panel and how long the work it started took */
interface RunEntry {
    prompt: string
    sentAt: number
    startedAt: number
    endedAt: number | null
    task: string
}

/** Glyphs the assistant puts in front of the terminal title */
const IDLE_GLYPHS = ['✳']
const WORKING_GLYPHS = ['◐', '◑', '◒', '◓']

const HISTORY_LIMIT = 200
const SCREEN_POLL_MS = 1000

/** Slash commands of the assistant offered by the "/" button; sent as typed text */
const COMMANDS = [
    { command: '/resume', label: 'Open a past conversation' },
    { command: '/compact', label: 'Summarize the conversation to free up context' },
    { command: '/context', label: 'Show how much context is used' },
    { command: '/model', label: 'Change the model' },
    { command: '/effort', label: 'Change the effort level' },
    { command: '/status', label: 'Show the session status' },
    { command: '/mcp', label: 'Manage MCP servers' },
    { command: '/config', label: 'Open the settings' },
    { command: '/clear', label: 'Start over with an empty conversation', confirm: true },
    { command: '/help', label: 'Show help' },
]

const MODELS = [
    { value: 'default', label: 'Default' },
    { value: 'opus', label: 'Opus' },
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'haiku', label: 'Haiku' },
    { value: 'fable', label: 'Fable' },
]
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** Permission modes as the assistant names them in its status line, and how the panel labels them */
const MODES = [
    { match: /auto mode on/i, label: 'Auto' },
    { match: /manual mode on/i, label: 'Ask first' },
    { match: /accept edits on/i, label: 'Accept edits' },
    { match: /plan mode on/i, label: 'Plan' },
    { match: /bypass permissions on/i, label: 'Bypass' },
]

/** Where pasted and attached files go on the remote machine */
const ATTACHMENT_DIR = '$HOME/.cache/tsugite/attachments'

function formatDuration (ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/** A row drawn with box-drawing dashes across most of the terminal: the edge of the assistant's own input box */
function isRule (line: string): boolean {
    const trimmed = line.trim()
    return trimmed.length >= 20 && /^[─━-]+$/.test(trimmed)
}

/**
 * Work panel under a terminal running an AI coding assistant. It never redraws the assistant's
 * output. It reads the terminal title and the bottom rows of the screen, types into the terminal
 * on the user's behalf, and can cover the assistant's own input box once it has its own.
 */
@Component({
    selector: 'assist-panel',
    templateUrl: './assistPanel.component.pug',
    styleUrls: ['./assistPanel.component.scss'],
})
export class AssistPanelComponent extends BaseComponent {
    @Input() tab: BaseTerminalTabComponent<any>
    @ViewChild('input') input: ElementRef<HTMLTextAreaElement>
    @HostBinding('class.collapsed') collapsed = false

    commands = COMMANDS
    models = MODELS
    efforts = EFFORTS
    /** Keys offered while the assistant waits for an answer: numbered choices or a list picked with arrows */
    answerKeys = [
        { label: '1', key: '1' },
        { label: '2', key: '2' },
        { label: '3', key: '3' },
        { label: '↑', key: '\x1b[A' },
        { label: '↓', key: '\x1b[B' },
        { label: 'Enter', key: '\r' },
    ]

    state: AssistState = 'starting'
    task = ''
    text = ''
    runs: RunEntry[] = []
    /** Prompts written while the assistant was busy; sent one by one as it becomes ready */
    queue: string[] = []
    now = Date.now()
    historyIndex = -1
    uploading = 0

    /** Read from the assistant's own status line and start-up header */
    mode = ''
    effort = ''
    model = ''

    private key = ''
    private stateSince = Date.now()
    private timer: number | null = null
    private titleSubscription: Subscription | null = null
    private outputSubscription: Subscription | null = null
    private draftTimer: number | null = null
    private cover: HTMLElement | null = null
    /** Set when the user clicks the cover to type in the terminal; cleared when they come back to the panel */
    private revealTerminalInput = false

    constructor (
        public config: ConfigService,
        private app: AppService,
        private activity: AssistActivityService,
        private hostApp: HostAppService,
        private hostWindow: HostWindowService,
        private platform: PlatformService,
        private notifications: NotificationsService,
        private selector: SelectorService,
        private translate: TranslateService,
        private zone: NgZone,
    ) {
        super()
    }

    ngOnInit (): void {
        this.key = this.tab.profile.tsugiteAssist ?? this.tab.profile.name
        this.collapsed = window.localStorage[this.storageKey('collapsed')] === 'true'
        this.text = window.localStorage[this.storageKey('draft')] ?? ''

        if (this.tab.frontend) {
            this.watchTerminal()
        }
        this.subscribeUntilDestroyed(this.tab.frontendReady$, () => this.watchTerminal())
        this.subscribeUntilDestroyed(this.tab.sessionChanged$, () => this.watchOutput())
        this.watchOutput()
        // Typing goes to the panel's input rather than the terminal whenever the tab comes forward
        this.subscribeUntilDestroyed(this.tab.focused$, () => {
            if (!this.collapsed && !this.revealTerminalInput) {
                this.focusInput()
            }
        })
        this.focusInput()

        this.zone.runOutsideAngular(() => {
            this.timer = window.setInterval(() => this.zone.run(() => this.tick()), SCREEN_POLL_MS)
        })
        this.report()
    }

    ngOnDestroy (): void {
        if (this.timer !== null) {
            window.clearInterval(this.timer)
        }
        this.titleSubscription?.unsubscribe()
        this.outputSubscription?.unsubscribe()
        this.cover?.remove()
        this.activity.update(this.key, this, null)
        super.ngOnDestroy()
    }

    get sendOnEnter (): boolean {
        return this.config.store.tsugite.assist.sendOnEnter
    }

    get hideTerminalInput (): boolean {
        return this.config.store.tsugite.assist.hideTerminalInput
    }

    get sendHint (): string {
        const mod = this.hostApp.platform === Platform.macOS ? '⌘' : 'Ctrl'
        return this.sendOnEnter
            ? this.translate.instant('Enter to send, Shift+Enter for a new line')
            : this.translate.instant('{mod}+Enter to send', { mod })
    }

    get elapsed (): string {
        return formatDuration(this.now - this.stateSince)
    }

    get busy (): boolean {
        return this.state === 'working' || this.state === 'waiting'
    }

    get stateLabel (): string {
        switch (this.state) {
            case 'working': return this.translate.instant('Working')
            case 'waiting': return this.translate.instant('Waiting for your answer')
            case 'idle': return this.translate.instant('Ready')
            case 'ended': return this.translate.instant('Ended')
            default: return this.translate.instant('Starting…')
        }
    }

    get modeLabel (): string {
        return this.mode || 'Default'
    }

    get modelLabel (): string {
        return [this.model || this.translate.instant('Model'), this.effort].filter(x => x).join(' · ')
    }

    get history (): string[] {
        try {
            return JSON.parse(window.localStorage[this.storageKey('history')] ?? '[]')
        } catch {
            return []
        }
    }

    get canReachRemote (): boolean {
        return !!this.tab.getRemoteExec()
    }

    runDuration (run: RunEntry): string {
        return formatDuration((run.endedAt ?? this.now) - run.startedAt)
    }

    ////// COMPOSER //////
    onKeyDown (event: KeyboardEvent): void {
        // Enter while an input method is composing confirms the conversion, it must not send
        if (event.isComposing || event.keyCode === 229) {
            return
        }
        if (event.key === 'Enter') {
            const modifier = event.ctrlKey || event.metaKey
            if (this.sendOnEnter ? !event.shiftKey && !event.altKey : modifier) {
                event.preventDefault()
                this.send()
            }
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            this.tab.frontend?.focus()
            return
        }
        const textarea = this.input.nativeElement
        if (event.key === 'ArrowUp' && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
            event.preventDefault()
            this.recall(1)
        }
        if (event.key === 'ArrowDown' && this.historyIndex >= 0 && textarea.selectionStart === textarea.value.length) {
            event.preventDefault()
            this.recall(-1)
        }
    }

    onInputFocus (): void {
        if (this.revealTerminalInput) {
            this.revealTerminalInput = false
            this.updateCover()
        }
    }

    onInput (): void {
        this.historyIndex = -1
        if (this.draftTimer !== null) {
            window.clearTimeout(this.draftTimer)
        }
        this.draftTimer = window.setTimeout(() => {
            window.localStorage[this.storageKey('draft')] = this.text
        }, 500)
    }

    /** Images pasted into the input are sent to the remote machine and referenced by path */
    onPaste (event: ClipboardEvent): void {
        const files = Array.from(event.clipboardData?.items ?? [])
            .filter(item => item.kind === 'file')
            .map(item => item.getAsFile())
            .filter((file): file is File => !!file)
        if (!files.length || !this.canReachRemote) {
            return
        }
        event.preventDefault()
        for (const file of files) {
            file.arrayBuffer().then(data => this.attach(file.name || 'pasted.png', Buffer.from(data)))
        }
    }

    /** The send button: sends what is written, or stops the run when there is nothing to send */
    sendOrStop (): void {
        if (!this.text.trim() && this.busy) {
            this.interrupt()
            return
        }
        this.send()
    }

    send (): void {
        const prompt = this.text.trim()
        if (!prompt) {
            return
        }
        this.remember(prompt)
        if (this.busy) {
            this.queue.push(prompt)
        } else {
            this.submit(prompt)
        }
        this.text = ''
        this.historyIndex = -1
        window.localStorage[this.storageKey('draft')] = ''
        this.focusInput()
    }

    sendQueuedNow (index: number): void {
        const [prompt] = this.queue.splice(index, 1)
        this.submit(prompt)
    }

    unqueue (index: number): void {
        const [prompt] = this.queue.splice(index, 1)
        if (!this.text.trim()) {
            this.text = prompt
            this.onInput()
        }
    }

    sendKey (key: string): void {
        this.tab.sendInput(key)
    }

    interrupt (): void {
        this.tab.sendInput('\x1b')
    }

    insertText (value: string): void {
        const textarea = this.input as ElementRef<HTMLTextAreaElement> | undefined
        const start = textarea?.nativeElement.selectionStart ?? this.text.length
        const end = textarea?.nativeElement.selectionEnd ?? this.text.length
        const before = this.text.slice(0, start)
        const spaced = (before && !/\s$/.test(before) ? ' ' : '') + value
        this.text = before + spaced + this.text.slice(end)
        this.onInput()
        setTimeout(() => {
            if (textarea) {
                textarea.nativeElement.focus()
                textarea.nativeElement.selectionStart = textarea.nativeElement.selectionEnd = start + spaced.length
            }
        })
    }

    reuse (prompt: string): void {
        this.text = prompt
        this.onInput()
        this.focusInput()
    }

    ////// TOOLBAR //////
    async attachClipboardImage (): Promise<void> {
        const image = require('@electron/remote').clipboard.readImage()
        if (image.isEmpty()) {
            this.notifications.info(this.translate.instant('There is no image on the clipboard'))
            return
        }
        await this.attach('clipboard.png', image.toPNG())
    }

    async attachFiles (): Promise<void> {
        const uploads = await this.platform.startUpload({ multiple: true })
        for (const upload of uploads) {
            const data = Buffer.from(await upload.readAll())
            upload.close()
            await this.attach(upload.getName(), data)
        }
    }

    /** Lists the files in the working folder on the remote machine and inserts the chosen one as `@path` */
    async pickRemoteFile (): Promise<void> {
        const exec = this.tab.getRemoteExec()
        if (!exec) {
            return
        }
        const workdir: string = this.tab.profile.options?.claudeWorkdir ?? ''
        const script = [
            'd="$1"',
            'case "$d" in "~") d="$HOME";; "~/"*) d="$HOME/${d#??}";; esac',
            'if [ -n "$d" ]; then cd "$d" 2>/dev/null; fi',
            'if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git ls-files | head -20000',
            'else find . -type f -not -path "*/.*" -not -path "*/node_modules/*" 2>/dev/null | sed "s|^./||" | head -5000; fi',
        ].join('; ')
        let files: string[] = []
        try {
            const safeWorkdir = /["'`$\\]/.test(workdir) ? '' : workdir
            files = (await exec(`sh -c '${script}' tsugite "${safeWorkdir}"`)).split('\n').filter(x => x)
        } catch (error) {
            this.notifications.error(this.translate.instant('Could not list the files'), String(error.message ?? error))
            return
        }
        const file = await this.selector.show(
            this.translate.instant('Refer to a file'),
            files.map(path => ({ name: path, result: path, icon: 'far fa-file' })),
        ).catch(() => null)
        if (file) {
            this.insertText(`@${file} `)
        }
    }

    async runCommand (item: typeof COMMANDS[number]): Promise<void> {
        if (item.confirm && (await this.platform.showMessageBox({
            type: 'warning',
            message: this.translate.instant('Send {command}?', { command: item.command }),
            detail: this.translate.instant(item.label),
            buttons: [this.translate.instant('Send'), this.translate.instant('Cancel')],
            defaultId: 1,
            cancelId: 1,
        })).response !== 0) {
            return
        }
        this.type(item.command)
    }

    setModel (value: string): void {
        this.type(`/model ${value}`)
        this.model = MODELS.find(x => x.value === value)?.label ?? value
    }

    setEffort (value: string): void {
        this.type(`/effort ${value}`)
        this.effort = value
    }

    /** The assistant switches its permission mode with Shift+Tab */
    cycleMode (): void {
        this.tab.sendInput('\x1b[Z')
        setTimeout(() => this.readScreen(), 300)
    }

    async toggleSendOnEnter (): Promise<void> {
        this.config.store.tsugite.assist.sendOnEnter = !this.sendOnEnter
        await this.config.save()
    }

    async toggleNotifications (): Promise<void> {
        this.config.store.tsugite.assist.notify = !this.config.store.tsugite.assist.notify
        await this.config.save()
    }

    async toggleHideTerminalInput (): Promise<void> {
        this.config.store.tsugite.assist.hideTerminalInput = !this.hideTerminalInput
        await this.config.save()
        this.updateCover()
    }

    toggleCollapsed (): void {
        this.collapsed = !this.collapsed
        window.localStorage[this.storageKey('collapsed')] = String(this.collapsed)
        // The terminal gets the space back (or gives it up), so let it refit
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'))
            this.updateCover()
        })
        if (!this.collapsed) {
            this.focusInput()
        }
    }

    focusInput (): void {
        // The input is not rendered while the panel is collapsed
        setTimeout(() => (this.input as ElementRef<HTMLTextAreaElement> | undefined)?.nativeElement.focus())
    }

    /** Copies a file to the remote machine and puts `@path` in the input so the assistant reads it */
    private async attach (name: string, data: Buffer): Promise<void> {
        const exec = this.tab.getRemoteExec()
        if (!exec) {
            return
        }
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
        const safeName = `${stamp}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}`
        this.uploading++
        try {
            const dir = (await exec(`sh -c 'mkdir -p "${ATTACHMENT_DIR}" && cd "${ATTACHMENT_DIR}" && cat > "$1" && pwd' tsugite "${safeName}"`, data)).trim()
            if (!dir.startsWith('/')) {
                throw new Error(dir || 'no answer')
            }
            this.insertText(`@${dir}/${safeName} `)
        } catch (error) {
            this.notifications.error(this.translate.instant('Could not send the file'), String(error.message ?? error))
        } finally {
            this.uploading--
        }
    }

    private submit (prompt: string): void {
        this.type(prompt)
        const now = Date.now()
        // Counted from the send: a run can go straight to a permission prompt without a working title
        this.runs.unshift({ prompt, sentAt: now, startedAt: now, endedAt: null, task: '' })
        this.runs = this.runs.slice(0, 50)
    }

    /** Types into the terminal as a paste followed by Enter, so line breaks stay in the prompt */
    private type (prompt: string): void {
        if (this.tab.frontend?.supportsBracketedPaste()) {
            this.tab.sendInput(`\x1b[200~${prompt}\x1b[201~`)
        } else {
            this.tab.sendInput(prompt.replace(/\r?\n/g, ' '))
        }
        setTimeout(() => this.tab.sendInput('\r'), 50)
    }

    private recall (direction: number): void {
        const history = this.history
        const index = Math.max(-1, Math.min(history.length - 1, this.historyIndex + direction))
        this.historyIndex = index
        this.text = index >= 0 ? history[index] : ''
    }

    private remember (prompt: string): void {
        const history = [prompt, ...this.history.filter(x => x !== prompt)].slice(0, HISTORY_LIMIT)
        window.localStorage[this.storageKey('history')] = JSON.stringify(history)
    }

    private storageKey (name: string): string {
        return `tsugite.assist.${name}.${this.key}`
    }

    ////// READING THE TERMINAL //////
    private watchTerminal (): void {
        if (!this.tab.frontend || this.titleSubscription) {
            return
        }
        this.titleSubscription = this.tab.frontend.title$.subscribe(title => this.zone.run(() => this.onTitle(title)))
    }

    /** Re-checks the screen shortly after the assistant draws, so the cover follows its input box */
    private watchOutput (): void {
        this.outputSubscription?.unsubscribe()
        this.outputSubscription = this.tab.session?.output$.pipe(auditTime(80)).subscribe(() => this.zone.run(() => this.readScreen())) ?? null
    }

    private onTitle (title: string): void {
        const glyph = [...title][0] ?? ''
        const rest = title.slice(glyph.length).trim()
        if (WORKING_GLYPHS.includes(glyph)) {
            this.task = rest
            this.setState('working')
        } else if (IDLE_GLYPHS.includes(glyph)) {
            this.task = rest
            this.setState(this.screenAsksForAnswer() ? 'waiting' : 'idle')
        }
    }

    private tick (): void {
        this.now = Date.now()
        if (this.tab.session && !this.tab.session.open && this.state !== 'ended') {
            this.setState('ended')
            return
        }
        this.readScreen()
    }

    private readScreen (): void {
        // A permission prompt or a question leaves the title idle, so the screen tells them apart.
        // Start-up questions (trusting the folder) come before any title is set.
        const asks = this.screenAsksForAnswer()
        if (this.state === 'idle' || this.state === 'waiting') {
            this.setState(asks ? 'waiting' : 'idle')
        } else if (this.state === 'starting' && asks) {
            this.setState('waiting')
        }
        this.readStatusLine()
        this.updateCover()
    }

    private screenAsksForAnswer (): boolean {
        const lines = this.tab.frontend?.getVisibleLines() ?? []
        const bottom = lines.slice(-16).join('\n')
        return /Esc to (cancel|exit)/i.test(bottom) && /(Do you want|Would you like|❯\s*\d+\.|Enter to (select|confirm))/i.test(bottom)
    }

    /** Permission mode and effort from the status line under the assistant's input box, the model from its header */
    private readStatusLine (): void {
        const lines = this.tab.frontend?.getVisibleLines() ?? []
        const top = this.inputBoxTop(lines)
        if (top !== null) {
            const status = lines.slice(top).join('\n')
            // The status line names no mode in the default (ask before acting) mode
            this.mode = MODES.find(x => x.match.test(status))?.label ?? ''
            const effort = /\b(low|medium|high|xhigh|max) · \/effort/.exec(status)
            if (effort) {
                this.effort = effort[1]
            }
        }
        if (!this.model) {
            for (const line of lines) {
                const header = /\b(Opus|Sonnet|Haiku|Fable)( [\d.]+)?(?: \([^)]*\))?(?: with \w+ effort)? · /.exec(line)
                if (header) {
                    this.model = header[1] + ((header[2] as string | undefined) ?? '')
                    break
                }
            }
        }
    }

    /**
     * Row where the assistant's own input box starts: a rule, a prompt line starting with ❯, and a
     * rule under it, near the bottom. Null whenever the bottom of the screen looks like anything else.
     */
    private inputBoxTop (lines: string[]): number | null {
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12); i--) {
            if (!isRule(lines[i])) {
                continue
            }
            // i is the rule under the prompt; look for the prompt line and the rule above it
            for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
                if (isRule(lines[j])) {
                    return lines[j + 1]?.trimStart().startsWith('❯') ? j : null
                }
            }
            return null
        }
        return null
    }

    /**
     * Covers the assistant's input box and the status lines under it with the terminal's own
     * background, so only the panel's input shows. Nothing is covered while the assistant asks a
     * question, after the user clicked the cover to type in the terminal, or when the layout is
     * not recognized.
     */
    private updateCover (): void {
        const content: HTMLElement | undefined = this.tab.content?.nativeElement
        const screen = content?.querySelector('.xterm-screen') as HTMLElement | null
        const lines = this.tab.frontend?.getVisibleLines() ?? []
        const top = this.hideTerminalInput && this.state !== 'waiting' && !this.revealTerminalInput ? this.inputBoxTop(lines) : null
        if (!content || !screen || top === null || !lines.length) {
            if (this.cover) {
                this.cover.style.display = 'none'
            }
            return
        }
        if (!this.cover) {
            this.cover = document.createElement('div')
            this.cover.className = 'assist-terminal-cover'
            this.cover.title = this.translate.instant('The terminal\'s own input is hidden; click to type in the terminal')
            this.cover.addEventListener('click', () => this.zone.run(() => {
                this.revealTerminalInput = true
                this.updateCover()
                this.tab.frontend?.focus()
            }))
            content.appendChild(this.cover)
        }
        const screenRect = screen.getBoundingClientRect()
        const contentRect = content.getBoundingClientRect()
        const rowHeight = screenRect.height / lines.length
        const background = getComputedStyle(content.querySelector('.xterm-viewport') ?? content).backgroundColor
        Object.assign(this.cover.style, {
            display: 'block',
            position: 'absolute',
            left: '0',
            right: '0',
            top: `${screenRect.top - contentRect.top + top * rowHeight}px`,
            bottom: '0',
            zIndex: '3',
            cursor: 'text',
            background,
        })
    }

    private setState (state: AssistState): void {
        if (state === this.state) {
            this.report()
            return
        }
        const previous = this.state
        this.state = state
        this.stateSince = Date.now()

        const run = this.runs[0] as RunEntry | undefined
        // Waiting for an answer is part of the run; it ends when the assistant is ready again
        if ((state === 'idle' || state === 'ended') && run && !run.endedAt) {
            run.endedAt = Date.now()
            run.task = this.task
        }

        if (state === 'idle' && this.queue.length) {
            // Give the prompt line a moment to settle before typing into it
            setTimeout(() => {
                if (this.state === 'idle' && this.queue.length) {
                    this.submit(this.queue.shift()!)
                }
            }, 800)
        } else if ((previous === 'working' || previous === 'waiting') && state === 'idle') {
            this.notify(this.translate.instant('Finished'), run ? formatDuration(Date.now() - run.startedAt) : '')
        }
        if (state === 'waiting') {
            this.notify(this.translate.instant('Waiting for your answer'), '')
        }
        this.report()
    }

    private report (): void {
        this.activity.update(this.key, this, { state: this.state, task: this.task, since: this.stateSince })
    }

    private notify (what: string, detail: string): void {
        if (!this.config.store.tsugite.assist.notify) {
            return
        }
        // Only when the user is not already looking at this tab
        if (document.hasFocus() && this.tab.hasFocus) {
            return
        }
        const body = [this.task, detail].filter(x => x).join(' · ')
        const notification = new Notification(`${this.key}: ${what}`, { body, silent: false })
        notification.onclick = () => this.zone.run(() => {
            this.hostWindow.bringToFront()
            const top = this.app.tabs.find(t => t === this.tab || t instanceof SplitTabComponent && t.getAllTabs().includes(this.tab))
            if (top) {
                this.app.selectTab(top)
                if (top instanceof SplitTabComponent) {
                    top.focus(this.tab)
                }
            }
        })
    }
}
