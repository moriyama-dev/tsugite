import { Component, Input, ViewChild, ElementRef, NgZone, HostBinding } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Subscription } from 'rxjs'
import {
    AppService, AssistActivityService, AssistState, BaseComponent, ConfigService, HostAppService, HostWindowService,
    Platform, PlatformService, SplitTabComponent, TranslateService,
} from 'tabby-core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import { SnippetsModalComponent, Snippet } from './snippetsModal.component'

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

/** Shown until the user edits the snippets; translated at display time */
const DEFAULT_SNIPPETS: Snippet[] = [
    { name: 'Continue', text: 'Please continue.' },
    { name: 'Plan first', text: 'Do not change any code yet. First show a plan of what you will change and how.' },
    { name: 'Summarize changes', text: 'Summarize the changes so far, briefly, file by file.' },
    { name: 'Run the tests', text: 'Run the tests and report the cause and a fix for any failure.' },
    { name: 'Commit', text: 'Review the changes and commit them with a suitable message.' },
]

const HISTORY_LIMIT = 200
const SCREEN_POLL_MS = 1000

/** Slash commands of the assistant offered in the menu; sent as typed text */
const COMMANDS = [
    { command: '/resume', label: 'Open a past conversation' },
    { command: '/compact', label: 'Summarize the conversation to free up context' },
    { command: '/model', label: 'Change the model' },
    { command: '/clear', label: 'Start over with an empty conversation', confirm: true },
    { command: '/help', label: 'Show help' },
]

function formatDuration (ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/**
 * Work panel under a terminal running an AI coding assistant. It never draws the assistant's
 * output: the terminal keeps showing the assistant as it is. The panel only adds a composer,
 * a state line read from the terminal title, notifications, prompt history, snippets and keys
 * sent on the user's behalf.
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

    private defaultSnippets: Snippet[] = []
    private key = ''
    private stateSince = Date.now()
    private timer: number | null = null
    private titleSubscription: Subscription | null = null
    private draftTimer: number | null = null

    constructor (
        public config: ConfigService,
        private app: AppService,
        private activity: AssistActivityService,
        private hostApp: HostAppService,
        private hostWindow: HostWindowService,
        private platform: PlatformService,
        private translate: TranslateService,
        private ngbModal: NgbModal,
        private zone: NgZone,
    ) {
        super()
    }

    ngOnInit (): void {
        this.key = this.tab.profile.tsugiteAssist ?? this.tab.profile.name
        this.defaultSnippets = DEFAULT_SNIPPETS.map(x => ({
            name: this.translate.instant(x.name),
            text: this.translate.instant(x.text),
        }))
        this.collapsed = window.localStorage[this.storageKey('collapsed')] === 'true'
        this.text = window.localStorage[this.storageKey('draft')] ?? ''

        if (this.tab.frontend) {
            this.watchTitle()
        }
        this.subscribeUntilDestroyed(this.tab.frontendReady$, () => this.watchTitle())

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
        this.activity.update(this.key, this, null)
        super.ngOnDestroy()
    }

    get sendOnEnter (): boolean {
        return this.config.store.tsugite.assist.sendOnEnter
    }

    get sendHint (): string {
        const mod = this.hostApp.platform === Platform.macOS ? '⌘' : 'Ctrl'
        return this.sendOnEnter
            ? this.translate.instant('Enter to send, Shift+Enter for a new line')
            : this.translate.instant('{mod}+Enter to send', { mod })
    }

    get snippets (): Snippet[] {
        return this.config.store.tsugite.assist.snippets ?? this.defaultSnippets
    }

    get elapsed (): string {
        return formatDuration(this.now - this.stateSince)
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

    runDuration (run: RunEntry): string {
        return formatDuration((run.endedAt ?? this.now) - run.startedAt)
    }

    ////// SENDING //////
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

    onInput (): void {
        this.historyIndex = -1
        if (this.draftTimer !== null) {
            window.clearTimeout(this.draftTimer)
        }
        this.draftTimer = window.setTimeout(() => {
            window.localStorage[this.storageKey('draft')] = this.text
        }, 500)
    }

    send (): void {
        const prompt = this.text.trim()
        if (!prompt) {
            return
        }
        this.remember(prompt)
        if (this.state === 'working' || this.state === 'waiting') {
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

    private submit (prompt: string): void {
        this.type(prompt)
        const now = Date.now()
        // Counted from the send: a run can go straight to a permission prompt without a working title
        this.runs.unshift({ prompt, sentAt: now, startedAt: now, endedAt: null, task: '' })
        this.runs = this.runs.slice(0, 50)
    }

    /** Types a prompt into the terminal as a paste followed by Enter, so line breaks stay in the prompt */
    private type (prompt: string): void {
        if (this.tab.frontend?.supportsBracketedPaste()) {
            this.tab.sendInput(`\x1b[200~${prompt}\x1b[201~`)
        } else {
            this.tab.sendInput(prompt.replace(/\r?\n/g, ' '))
        }
        setTimeout(() => this.tab.sendInput('\r'), 50)
    }

    sendKey (key: string): void {
        this.tab.sendInput(key)
    }

    interrupt (): void {
        this.tab.sendInput('\x1b')
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

    insertSnippet (snippet: Snippet): void {
        const textarea = this.input.nativeElement
        const start = textarea.selectionStart
        this.text = this.text.slice(0, start) + snippet.text + this.text.slice(textarea.selectionEnd)
        this.onInput()
        setTimeout(() => {
            textarea.focus()
            textarea.selectionStart = textarea.selectionEnd = start + snippet.text.length
        })
    }

    async editSnippets (): Promise<void> {
        const modal = this.ngbModal.open(SnippetsModalComponent, { size: 'lg' })
        modal.componentInstance.snippets = this.snippets.map(x => ({ ...x }))
        const result = await modal.result.catch(() => null)
        if (result) {
            this.config.store.tsugite.assist.snippets = result
            await this.config.save()
        }
    }

    reuse (run: RunEntry): void {
        this.text = run.prompt
        this.onInput()
        this.focusInput()
    }

    get history (): string[] {
        try {
            return JSON.parse(window.localStorage[this.storageKey('history')] ?? '[]')
        } catch {
            return []
        }
    }

    pickHistory (prompt: string): void {
        this.text = prompt
        this.onInput()
        this.focusInput()
    }

    async toggleSendOnEnter (): Promise<void> {
        this.config.store.tsugite.assist.sendOnEnter = !this.sendOnEnter
        await this.config.save()
    }

    async toggleNotifications (): Promise<void> {
        this.config.store.tsugite.assist.notify = !this.config.store.tsugite.assist.notify
        await this.config.save()
    }

    toggleCollapsed (): void {
        this.collapsed = !this.collapsed
        window.localStorage[this.storageKey('collapsed')] = String(this.collapsed)
        // The terminal gets the space back (or gives it up), so let it refit
        setTimeout(() => window.dispatchEvent(new Event('resize')))
        if (!this.collapsed) {
            this.focusInput()
        }
    }

    focusInput (): void {
        // The input is not rendered while the panel is collapsed
        setTimeout(() => (this.input as ElementRef<HTMLTextAreaElement> | undefined)?.nativeElement.focus())
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

    ////// STATE //////
    private watchTitle (): void {
        if (!this.tab.frontend || this.titleSubscription) {
            return
        }
        this.titleSubscription = this.tab.frontend.title$.subscribe(title => this.zone.run(() => this.onTitle(title)))
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
        // A permission prompt or a question leaves the title idle, so the screen tells them apart.
        // Start-up questions (trusting the folder) come before any title is set.
        if (this.state === 'idle' || this.state === 'waiting') {
            this.setState(this.screenAsksForAnswer() ? 'waiting' : 'idle')
        } else if (this.state === 'starting' && this.screenAsksForAnswer()) {
            this.setState('waiting')
        }
    }

    private screenAsksForAnswer (): boolean {
        const lines = this.tab.frontend?.getVisibleLines() ?? []
        const bottom = lines.slice(-16).join('\n')
        return /Esc to (cancel|exit)/i.test(bottom) && /(Do you want|Would you like|❯\s*\d+\.|Enter to (select|confirm))/i.test(bottom)
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
