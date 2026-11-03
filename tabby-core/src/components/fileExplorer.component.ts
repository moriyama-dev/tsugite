import { Component, ElementRef, EventEmitter, HostListener, Input, NgZone, Output, ViewChild } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { Subscription } from 'rxjs'
import * as path from 'path'

import { AppService } from '../services/app.service'
import { NotificationsService } from '../services/notifications.service'
import { HostAppService, Platform } from '../api/hostApp'
import { PlatformService } from '../api/platform'
import { MenuItemOptions } from '../api/menu'
import { ExplorerEntry, ExplorerSource, isExplorerSourceProvider } from '../api/explorer'
import { BaseTabComponent } from './baseTab.component'
import { SplitTabComponent } from './splitTab.component'
import { BaseComponent } from './base.component'

/** Hidden as in VS Code's default files.exclude */
const HIDDEN_NAMES = new Set(['.git', '.svn', '.hg', 'CVS', '.DS_Store', 'Thumbs.db'])
/** Refreshes closer together than this are merged */
const REFRESH_INTERVAL = 1500
/** How long a remote shell may stay silent about its folder before the explorer says so */
const UNTRACKED_NOTICE_DELAY = 4000

const FILE_ICONS: [string, string[]][] = [
    ['far fa-file-image', ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff', 'heic', 'avif', 'icns']],
    ['far fa-file-pdf', ['pdf']],
    ['far fa-file-zipper', ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar', 'deb', 'rpm', 'dmg']],
    ['far fa-file-audio', ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus']],
    ['far fa-file-video', ['mp4', 'mov', 'mkv', 'webm', 'avi']],
    ['far fa-file-excel', ['csv', 'tsv', 'xls', 'xlsx', 'ods']],
    ['far fa-file-word', ['doc', 'docx', 'odt', 'rtf']],
    ['far fa-file-code', [
        'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'c', 'h', 'cc', 'cpp', 'hpp', 'java', 'kt', 'swift',
        'php', 'lua', 'sh', 'bash', 'zsh', 'fish', 'pl', 'r', 'cs', 'scala', 'dart', 'vue', 'svelte', 'html', 'htm', 'css',
        'scss', 'sass', 'less', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'sql', 'pug', 'mk', 'gradle',
    ]],
    ['far fa-file-lines', ['md', 'markdown', 'txt', 'log', 'rst', 'adoc', 'org', 'po']],
]

function formatSize (size: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = size
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${unit ? value.toFixed(value < 10 ? 1 : 0) : value} ${units[unit]}`
}

/** As ls -l shows it: drwxr-xr-x */
function formatMode (entry: ExplorerEntry): string {
    const type = entry.isSymlink ? 'l' : entry.isDirectory ? 'd' : '-'
    const bits = 'rwxrwxrwx'.split('').map((char, i) => entry.mode & 1 << 8 - i ? char : '-').join('')
    return type + bits
}

export interface ExplorerRow {
    entry: ExplorerEntry
    depth: number
    expanded: boolean
    /** A folder whose contents are being read for the first time */
    loading: boolean
}

/** A name being typed in the tree: a rename, or a new file or folder */
interface ExplorerEdit {
    mode: 'rename' | 'new-file' | 'new-folder'
    /** The folder the new entry goes into, or the renamed entry's folder */
    dir: string
    entry?: ExplorerEntry
    value: string
}

/** What the explorer remembers for each terminal while another one is shown */
interface SourceState {
    expanded: Set<string>
    selected: string | null
    fallback?: Promise<string | null>
}

/**
 * Shows the folder the focused terminal is in, like VS Code's explorer: a tree that follows
 * the shell, where files can be opened, created, renamed and deleted.
 */
@Component({
    selector: 'file-explorer',
    templateUrl: './fileExplorer.component.pug',
    styleUrls: ['./fileExplorer.component.scss'],
})
export class FileExplorerComponent extends BaseComponent {
    @Input() collapsed = false
    @Output() collapsedChange = new EventEmitter<boolean>()
    @ViewChild('editInput') editInput?: ElementRef<HTMLInputElement>

    state: 'no-terminal' | 'unsupported' | 'loading' | 'ready' | 'error' = 'no-terminal'
    error = ''
    root: string | null = null
    /** False while the folder shown is the home folder because the shell has not said where it is */
    tracked = true
    showUntrackedNotice = false
    rows: ExplorerRow[] = []
    selected: string | null = null
    edit: ExplorerEdit | null = null

    private source: ExplorerSource | null = null
    private sourceSubscription: Subscription | null = null
    private focusSubscription: Subscription | null = null
    private sourceStates = new WeakMap<ExplorerSource, SourceState>()
    private expanded = new Set<string>()
    /** Folder -> its entries, as last read */
    private listings = new Map<string, ExplorerEntry[]>()
    private lastRefresh = 0
    private refreshTimer: number | undefined
    private untrackedTimer: number | undefined
    private attachedAt = 0

    constructor (
        private app: AppService,
        private platform: PlatformService,
        private hostApp: HostAppService,
        private notifications: NotificationsService,
        private translate: TranslateService,
        private zone: NgZone,
    ) {
        super()
    }

    get local (): boolean {
        return this.source?.fileSystem.local ?? true
    }

    get rootName (): string {
        return this.root ? path.posix.basename(this.root) || this.root : ''
    }

    ngOnInit (): void {
        this.subscribeUntilDestroyed(this.app.activeTabChange$, () => this.attach())
        this.subscribeUntilDestroyed(this.app.tabsChanged$, () => this.attach())
        this.attach()
    }

    ngOnDestroy (): void {
        this.sourceSubscription?.unsubscribe()
        this.focusSubscription?.unsubscribe()
        window.clearTimeout(this.refreshTimer)
        window.clearTimeout(this.untrackedTimer)
        super.ngOnDestroy()
    }

    /** Files may change in other apps while the window is in the background */
    @HostListener('window:focus')
    onWindowFocus (): void {
        if (this.source) {
            this.scheduleRefresh()
        }
    }

    toggleCollapsed (): void {
        this.collapsed = !this.collapsed
        this.collapsedChange.emit(this.collapsed)
        if (!this.collapsed) {
            this.attach(true)
        }
    }

    ////// FOLLOWING THE TERMINAL //////

    /** Follows the focused terminal: the active tab, or the focused pane of a split */
    private attach (force = false): void {
        const tab = this.app.activeTab
        this.focusSubscription?.unsubscribe()
        this.focusSubscription = null
        let focused: BaseTabComponent | null = tab
        if (tab instanceof SplitTabComponent) {
            this.focusSubscription = tab.focusChanged$.subscribe(() => this.attach())
            focused = tab.getFocusedTab()
        }

        const source = focused && isExplorerSourceProvider(focused) ? focused.getExplorerSource() : null
        if (source === this.source && !force) {
            return
        }
        this.saveSourceState()
        this.sourceSubscription?.unsubscribe()
        this.sourceSubscription = null
        this.source = source
        this.edit = null
        this.listings.clear()
        this.rows = []
        this.root = null
        window.clearTimeout(this.untrackedTimer)
        this.showUntrackedNotice = false

        if (!focused) {
            this.state = 'no-terminal'
            return
        }
        if (!source) {
            this.state = isExplorerSourceProvider(focused) ? 'unsupported' : 'no-terminal'
            return
        }
        const saved = this.sourceStates.get(source)
        this.expanded = saved?.expanded ?? new Set()
        this.selected = saved?.selected ?? null
        this.state = 'loading'
        this.attachedAt = Date.now()
        this.sourceSubscription = source.changed$.subscribe(() => this.zone.run(() => this.sync()))
        this.sync()
    }

    private saveSourceState (): void {
        if (this.source) {
            const previous = this.sourceStates.get(this.source)
            this.sourceStates.set(this.source, { ...previous, expanded: this.expanded, selected: this.selected })
        }
    }

    private getSourceState (source: ExplorerSource): SourceState {
        let state = this.sourceStates.get(source)
        if (!state) {
            state = { expanded: this.expanded, selected: this.selected }
            this.sourceStates.set(source, state)
        }
        return state
    }

    /** Moves to the folder the shell is in, or refreshes the one shown */
    private async sync (): Promise<void> {
        const source = this.source
        if (!source || this.collapsed) {
            return
        }
        const cwd = await source.getCwd().catch(() => null)
        let dir = cwd
        if (!dir) {
            const state = this.getSourceState(source)
            state.fallback ??= source.getFallbackDirectory().catch(() => null)
            dir = await state.fallback
            if (!dir) {
                // Asked too early (not connected yet): ask again next time
                state.fallback = undefined
            }
        }
        if (source !== this.source) {
            return
        }
        this.tracked = !!cwd || source.fileSystem.local
        this.updateUntrackedNotice()
        if (!dir) {
            return
        }
        if (dir !== this.root) {
            this.root = dir
            this.listings.clear()
            await this.refresh()
        } else {
            this.scheduleRefresh()
        }
    }

    private updateUntrackedNotice (): void {
        window.clearTimeout(this.untrackedTimer)
        if (this.tracked) {
            this.showUntrackedNotice = false
            return
        }
        const wait = this.attachedAt + UNTRACKED_NOTICE_DELAY - Date.now()
        if (wait <= 0) {
            this.showUntrackedNotice = true
        } else {
            this.untrackedTimer = window.setTimeout(() => this.zone.run(() => this.updateUntrackedNotice()), wait)
        }
    }

    /** Refreshes now, or as soon as the last refresh is far enough back */
    private scheduleRefresh (): void {
        if (this.refreshTimer !== undefined) {
            return
        }
        const wait = Math.max(0, this.lastRefresh + REFRESH_INTERVAL - Date.now())
        this.refreshTimer = window.setTimeout(() => this.zone.run(() => {
            this.refreshTimer = undefined
            this.refresh()
        }), wait)
    }

    /** Reads the root and every open folder under it again */
    async refresh (): Promise<void> {
        const source = this.source
        const root = this.root
        if (!source || !root) {
            return
        }
        this.lastRefresh = Date.now()
        const dirs = [root, ...[...this.expanded].filter(dir => this.isUnder(dir, root))]
        const results = await Promise.all(dirs.map(dir => source.fileSystem.list(dir).then(
            entries => ({ dir, entries, error: null }),
            error => ({ dir, entries: null, error }),
        )))
        if (source !== this.source || root !== this.root) {
            return
        }
        for (const result of results) {
            if (result.entries) {
                this.listings.set(result.dir, result.entries)
            } else if (result.dir === root) {
                this.state = 'error'
                this.error = String(result.error?.message ?? result.error)
                this.rows = []
                return
            } else {
                // The folder went away
                this.listings.delete(result.dir)
                this.expanded.delete(result.dir)
            }
        }
        this.state = 'ready'
        this.buildRows()
    }

    private isUnder (p: string, dir: string): boolean {
        return p.startsWith(dir.endsWith('/') ? dir : dir + '/')
    }

    private buildRows (): void {
        const rows: ExplorerRow[] = []
        const walk = (dir: string, depth: number) => {
            for (const entry of this.sorted(this.listings.get(dir) ?? [])) {
                const expanded = entry.isDirectory && this.expanded.has(entry.path)
                rows.push({ entry, depth, expanded, loading: expanded && !this.listings.has(entry.path) })
                if (expanded) {
                    walk(entry.path, depth + 1)
                }
            }
        }
        if (this.root) {
            walk(this.root, 0)
        }
        this.rows = rows
    }

    /** Folders first, then by name, ignoring case and comparing numbers by value (as VS Code does) */
    private sorted (entries: ExplorerEntry[]): ExplorerEntry[] {
        return entries
            .filter(entry => !HIDDEN_NAMES.has(entry.name))
            .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    }

    trackRow (_index: number, row: ExplorerRow): string {
        return row.entry.path
    }

    ////// TREE //////

    async toggle (row: ExplorerRow): Promise<void> {
        if (!row.entry.isDirectory) {
            return
        }
        if (this.expanded.has(row.entry.path)) {
            this.expanded.delete(row.entry.path)
            this.buildRows()
            return
        }
        this.expanded.add(row.entry.path)
        await this.loadFolder(row.entry.path)
    }

    private async loadFolder (dir: string): Promise<void> {
        const source = this.source
        this.buildRows()
        try {
            const entries = await source!.fileSystem.list(dir)
            if (source === this.source) {
                this.listings.set(dir, entries)
            }
        } catch (error) {
            this.expanded.delete(dir)
            this.notifications.error(this.translate.instant('Could not open {name}', { name: path.posix.basename(dir) }), String(error.message ?? error))
        }
        this.buildRows()
    }

    collapseAll (): void {
        this.expanded.clear()
        this.buildRows()
    }

    onRowClick (row: ExplorerRow): void {
        this.selected = row.entry.path
        if (row.entry.isDirectory) {
            this.toggle(row)
        }
    }

    onRowDoubleClick (row: ExplorerRow): void {
        if (!row.entry.isDirectory) {
            this.open(row.entry)
        }
    }

    async open (entry: ExplorerEntry): Promise<void> {
        try {
            await this.source?.fileSystem.open(entry)
        } catch (error) {
            this.notifications.error(this.translate.instant('Could not open {name}', entry), String(error.message ?? error))
        }
    }

    changeDirectory (entry: ExplorerEntry): void {
        this.source?.changeDirectory(entry.isDirectory ? entry.path : path.posix.dirname(entry.path))
    }

    copyPath (p: string): void {
        this.platform.setClipboard({ text: p })
        this.notifications.notice(this.translate.instant('Copied'))
    }

    ////// KEYBOARD //////

    onKeyDown (event: KeyboardEvent): void {
        if (this.edit) {
            return
        }
        const index = this.rows.findIndex(row => row.entry.path === this.selected)
        const row = this.rows[index] as ExplorerRow | undefined
        const select = (i: number) => {
            const target = this.rows[Math.min(Math.max(i, 0), this.rows.length - 1)] as ExplorerRow | undefined
            if (target) {
                this.selected = target.entry.path
                setTimeout(() => document.querySelector('file-explorer .explorer-row.selected')?.scrollIntoView({ block: 'nearest' }))
            }
        }
        const macDelete = this.hostApp.platform === Platform.macOS && event.metaKey && event.key === 'Backspace'
        if (event.key === 'ArrowDown') {
            select(index + 1)
        } else if (event.key === 'ArrowUp') {
            select(index < 0 ? 0 : index - 1)
        } else if (event.key === 'ArrowRight' && row?.entry.isDirectory) {
            if (row.expanded) {
                select(index + 1)
            } else {
                this.toggle(row)
            }
        } else if (event.key === 'ArrowLeft' && row) {
            if (row.expanded) {
                this.toggle(row)
            } else {
                // To the folder it is in
                const parent = path.posix.dirname(row.entry.path)
                select(this.rows.findIndex(r => r.entry.path === parent))
            }
        } else if (event.key === 'Enter' && row) {
            if (row.entry.isDirectory) {
                this.toggle(row)
            } else {
                this.open(row.entry)
            }
        } else if (event.key === 'F2' && row) {
            this.startRename(row.entry)
        } else if ((event.key === 'Delete' || macDelete) && row) {
            this.delete(row.entry)
        } else {
            return
        }
        event.preventDefault()
        event.stopPropagation()
    }

    ////// NAMING //////

    /** The folder a new entry goes into: the selected folder, or the folder of the selected file */
    private targetFolder (entry?: ExplorerEntry): string | null {
        entry ??= this.rows.find(row => row.entry.path === this.selected)?.entry
        if (!entry) {
            return this.root
        }
        return entry.isDirectory ? entry.path : path.posix.dirname(entry.path)
    }

    async startCreate (mode: 'new-file' | 'new-folder', entry?: ExplorerEntry): Promise<void> {
        const dir = this.targetFolder(entry)
        if (!dir) {
            return
        }
        if (dir !== this.root && !this.expanded.has(dir)) {
            this.expanded.add(dir)
            await this.loadFolder(dir)
        }
        this.edit = { mode, dir, value: '' }
        this.focusEditInput()
    }

    startRename (entry: ExplorerEntry): void {
        this.selected = entry.path
        this.edit = { mode: 'rename', dir: path.posix.dirname(entry.path), entry, value: entry.name }
        this.focusEditInput(true)
    }

    private focusEditInput (selectStem = false): void {
        setTimeout(() => {
            const input = this.editInput?.nativeElement
            if (!input || !this.edit) {
                return
            }
            // ngModel may not have written it yet
            input.value = this.edit.value
            input.focus()
            // As in VS Code, a rename selects the name without its extension
            const dot = input.value.lastIndexOf('.')
            input.setSelectionRange(0, selectStem && dot > 0 ? dot : input.value.length)
        })
    }

    /** The row the new entry's input goes after: the folder itself, or the root's top */
    isCreateAnchor (row: ExplorerRow | null): boolean {
        if (!this.edit || this.edit.mode === 'rename') {
            return false
        }
        return row ? row.entry.path === this.edit.dir : this.edit.dir === this.root
    }

    createDepth (): number {
        if (!this.edit || !this.root || this.edit.dir === this.root) {
            return 0
        }
        return this.rows.find(row => row.entry.path === this.edit!.dir)!.depth + 1
    }

    onEditKeyDown (event: KeyboardEvent): void {
        event.stopPropagation()
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault()
            this.commitEdit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            this.edit = null
        }
    }

    async commitEdit (): Promise<void> {
        const edit = this.edit
        const source = this.source
        if (!edit || !source) {
            return
        }
        this.edit = null
        const name = edit.value.trim()
        if (!name || name === edit.entry?.name) {
            return
        }
        if (name.includes('/') || name === '.' || name === '..') {
            this.notifications.error(this.translate.instant('"{name}" cannot be used as a name', { name }))
            return
        }
        const target = path.posix.join(edit.dir, name)
        try {
            if (edit.mode === 'rename') {
                await source.fileSystem.rename(edit.entry!.path, target)
                if (this.expanded.delete(edit.entry!.path)) {
                    this.expanded.add(target)
                }
            } else if (edit.mode === 'new-file') {
                await source.fileSystem.createFile(target)
            } else {
                await source.fileSystem.createDirectory(target)
            }
            this.selected = target
        } catch (error) {
            this.notifications.error(this.translate.instant('Could not save {name}', { name }), String(error.message ?? error))
        }
        await this.refresh()
    }

    async delete (entry: ExplorerEntry): Promise<void> {
        const source = this.source
        if (!source) {
            return
        }
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: source.fileSystem.local
                ? this.translate.instant('Move "{name}" to the trash?', entry)
                : this.translate.instant('Delete "{name}"?', entry),
            detail: source.fileSystem.local
                ? undefined
                : entry.isDirectory && !entry.isSymlink
                    ? this.translate.instant('The folder and everything in it are deleted on the server. This cannot be undone.')
                    : this.translate.instant('It is deleted on the server. This cannot be undone.'),
            buttons: [
                source.fileSystem.local ? this.translate.instant('Move to trash') : this.translate.instant('Delete'),
                this.translate.instant('Cancel'),
            ],
            defaultId: 1,
            cancelId: 1,
        })
        if (result.response !== 0) {
            return
        }
        try {
            await source.fileSystem.delete(entry)
        } catch (error) {
            this.notifications.error(this.translate.instant('Could not delete {name}', entry), String(error.message ?? error))
        }
        await this.refresh()
    }

    ////// MENUS //////

    rowContextMenu (row: ExplorerRow, event: MouseEvent): void {
        event.preventDefault()
        event.stopPropagation()
        this.selected = row.entry.path
        const entry = row.entry
        const fileSystem = this.source?.fileSystem
        const items: MenuItemOptions[] = []
        if (entry.isDirectory) {
            items.push({ type: 'normal', label: this.translate.instant('Open in terminal'), click: () => this.changeDirectory(entry) })
        } else {
            items.push({ type: 'normal', label: this.translate.instant('Open'), click: () => this.open(entry) })
        }
        if (fileSystem?.reveal) {
            items.push({ type: 'normal', label: this.revealLabel(), click: () => fileSystem.reveal!(entry) })
        }
        items.push(
            { type: 'separator' },
            { type: 'normal', label: this.translate.instant('New file…'), click: () => this.startCreate('new-file', entry) },
            { type: 'normal', label: this.translate.instant('New folder…'), click: () => this.startCreate('new-folder', entry) },
            { type: 'separator' },
            { type: 'normal', label: this.translate.instant('Copy path'), click: () => this.copyPath(entry.path) },
            { type: 'separator' },
            { type: 'normal', label: this.translate.instant('Rename…'), sublabel: 'F2', click: () => this.startRename(entry) },
            { type: 'normal', label: this.translate.instant('Delete'), click: () => this.delete(entry) },
        )
        this.platform.popupContextMenu(items, event)
    }

    backgroundContextMenu (event: MouseEvent): void {
        event.preventDefault()
        if (!this.root) {
            return
        }
        const root = this.root
        this.platform.popupContextMenu([
            { type: 'normal', label: this.translate.instant('New file…'), click: () => this.startCreate('new-file', this.rootEntry()) },
            { type: 'normal', label: this.translate.instant('New folder…'), click: () => this.startCreate('new-folder', this.rootEntry()) },
            { type: 'separator' },
            { type: 'normal', label: this.translate.instant('Copy path'), click: () => this.copyPath(root) },
            { type: 'normal', label: this.translate.instant('Refresh'), click: () => this.refresh() },
        ], event)
    }

    private rootEntry (): ExplorerEntry {
        return { name: this.rootName, path: this.root!, isDirectory: true, isSymlink: false, size: 0, mode: 0, modified: null }
    }

    private revealLabel (): string {
        if (this.hostApp.platform === Platform.macOS) {
            return this.translate.instant('Reveal in Finder')
        }
        return this.translate.instant('Show in file manager')
    }

    ////// DISPLAY //////

    iconFor (row: ExplorerRow): string {
        const entry = row.entry
        if (entry.isDirectory) {
            return row.expanded ? 'fas fa-folder-open' : 'fas fa-folder'
        }
        const ext = entry.name.includes('.') ? entry.name.split('.').pop()!.toLowerCase() : ''
        for (const [icon, exts] of FILE_ICONS) {
            if (exts.includes(ext)) {
                return icon
            }
        }
        return 'far fa-file'
    }

    /** The details VS Code leaves out of the tree, shown on hover */
    tooltipFor (entry: ExplorerEntry): string {
        const lines = [entry.path]
        if (!entry.isDirectory) {
            lines.push(`${this.translate.instant('Size')}: ${formatSize(entry.size)}`)
        }
        if (entry.mode) {
            lines.push(`${this.translate.instant('Permissions')}: ${formatMode(entry)}`)
        }
        if (entry.modified) {
            lines.push(`${this.translate.instant('Modified')}: ${entry.modified.toLocaleString()}`)
        }
        return lines.join('\n')
    }
}
