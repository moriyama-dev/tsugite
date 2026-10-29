import * as fs from 'fs'
import { Injectable } from '@angular/core'
import { webUtils } from 'electron'
import { HostWindowService } from 'tabby-core'
import { TerminalService } from 'tabby-local'

/**
 * Dropping a folder anywhere on the window opens a terminal in it, as VS Code opens a dropped folder.
 * Dropped files keep going to PathDropDecorator, which types their paths into the terminal.
 * @hidden
 */
@Injectable({ providedIn: 'root' })
export class FolderDropService {
    constructor (
        private terminal: TerminalService,
        private hostWindow: HostWindowService,
    ) { }

    init (): void {
        // Capture phase, so a folder dropped on a terminal is not also typed into it
        document.addEventListener('drop', event => this.onDrop(event), true)
    }

    private onDrop (event: DragEvent): void {
        const files = Array.from(event.dataTransfer?.files ?? [])
        const folders = files.map(file => webUtils.getPathForFile(file)).filter(path => this.isDirectory(path))
        if (!folders.length) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        for (const folder of folders) {
            this.terminal.openTab(undefined, folder)
        }
        this.hostWindow.bringToFront()
    }

    private isDirectory (path: string): boolean {
        try {
            return !!path && fs.statSync(path).isDirectory()
        } catch {
            return false
        }
    }
}
