import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import { posix as posixPath } from 'path'
import { ExplorerEntry, ExplorerFileSystem, NotificationsService, PlatformService, TranslateService } from 'tabby-core'
import * as russh from 'russh'
import { SSHSession } from './session/ssh'
import { SFTPSession } from './session/sftp'

/** Bigger files are not fetched to be opened */
const MAX_OPEN_SIZE = 200 * 1024 * 1024
/** Editors save in several steps; wait for them to finish before sending the file back */
const SAVE_SETTLE_TIME = 700

/** The files of an SSH server, over SFTP on the terminal's own connection */
export class SFTPExplorerFileSystem implements ExplorerFileSystem {
    readonly local = false
    private sftp: SFTPSession | null = null
    private sftpFor: SSHSession | null = null
    /** Remote path -> watcher of the local copy that was opened */
    private watchers = new Map<string, fs.FSWatcher>()

    constructor (
        private getSession: () => SSHSession | null,
        private machineName: string,
        private platform: PlatformService,
        private notifications: NotificationsService,
        private translate: TranslateService,
    ) { }

    private async getSFTP (): Promise<SFTPSession> {
        const session = this.getSession()
        if (!session?.open) {
            throw new Error(this.translate.instant('Not connected'))
        }
        // A reconnect brings a new session
        if (!this.sftp || this.sftpFor !== session) {
            this.sftp = await session.openSFTP()
            this.sftpFor = session
        }
        return this.sftp
    }

    async list (dir: string): Promise<ExplorerEntry[]> {
        const sftp = await this.getSFTP()
        const files = await sftp.readdir(dir)
        return Promise.all(files.map(async file => {
            let isDirectory = file.isDirectory
            if (file.isSymlink) {
                // stat follows the link, so a link to a folder opens like one
                isDirectory = await sftp.stat(file.fullPath).then(target => target.isDirectory, () => false)
            }
            return {
                name: file.name,
                path: file.fullPath,
                isDirectory,
                isSymlink: file.isSymlink,
                size: file.size,
                mode: file.mode,
                modified: file.modified.getTime() ? file.modified : null,
            }
        }))
    }

    async exists (p: string): Promise<boolean> {
        const sftp = await this.getSFTP()
        return sftp.stat(p).then(() => true, () => false)
    }

    async createFile (p: string): Promise<void> {
        if (await this.exists(p)) {
            throw new Error(this.translate.instant('{name} already exists', { name: posixPath.basename(p) }))
        }
        const handle = await (await this.getSFTP()).open(p, russh.OPEN_WRITE | russh.OPEN_CREATE)
        await handle.close()
    }

    async createDirectory (p: string): Promise<void> {
        await (await this.getSFTP()).mkdir(p)
    }

    async rename (from: string, to: string): Promise<void> {
        if (await this.exists(to)) {
            throw new Error(this.translate.instant('{name} already exists', { name: posixPath.basename(to) }))
        }
        await (await this.getSFTP()).rename(from, to)
    }

    async delete (entry: ExplorerEntry): Promise<void> {
        const sftp = await this.getSFTP()
        // A link is removed itself, never what it points to
        if (entry.isDirectory && !entry.isSymlink) {
            for (const child of await this.list(entry.path)) {
                await this.delete(child)
            }
            await sftp.rmdir(entry.path)
        } else {
            await sftp.unlink(entry.path)
        }
    }

    async open (entry: ExplorerEntry): Promise<void> {
        if (entry.size > MAX_OPEN_SIZE) {
            throw new Error(this.translate.instant('{name} is too big to open from here', entry))
        }
        const local = this.localCopyPath(entry.path)
        if (!this.watchers.has(entry.path)) {
            // Only the user can read the copies
            await fsp.mkdir(path.dirname(local), { recursive: true, mode: 0o700 })
            await this.download(entry.path, local)
            this.watch(entry.path, local)
        }
        this.platform.openPath(local)
    }

    /** Stops sending opened files back (the tab closed) */
    dispose (): void {
        for (const watcher of this.watchers.values()) {
            watcher.close()
        }
        this.watchers.clear()
    }

    /** One folder per remote file, so two files with the same name do not collide */
    private localCopyPath (remotePath: string): string {
        const hash = createHash('sha256').update(`${this.machineName}:${remotePath}`).digest('hex').slice(0, 16)
        return path.join(os.tmpdir(), 'tsugite-open', hash, posixPath.basename(remotePath))
    }

    private async download (remotePath: string, local: string): Promise<void> {
        const handle = await (await this.getSFTP()).open(remotePath, russh.OPEN_READ)
        const out = await fsp.open(local, 'w', 0o600)
        try {
            for (;;) {
                const chunk = await handle.read()
                if (!chunk.length) {
                    break
                }
                await out.write(chunk)
            }
        } finally {
            await out.close()
            await handle.close()
        }
    }

    private async upload (local: string, remotePath: string): Promise<void> {
        const content = await fsp.readFile(local)
        // Written in place, so the remote file keeps its owner and permissions
        const handle = await (await this.getSFTP()).open(remotePath, russh.OPEN_WRITE | russh.OPEN_CREATE | russh.OPEN_TRUNCATE)
        try {
            for (let offset = 0; offset < content.length; offset += 32768) {
                const piece = content.subarray(offset, offset + 32768)
                await handle.write(new Uint8Array(piece.buffer, piece.byteOffset, piece.byteLength))
            }
        } finally {
            await handle.close()
        }
    }

    private watch (remotePath: string, local: string): void {
        let timer: ReturnType<typeof setTimeout> | undefined = undefined
        let lastSent = fs.statSync(local).mtimeMs
        // The folder, not the file: editors that save by replacing the file would end a file watch
        const watcher = fs.watch(path.dirname(local), (_event, filename) => {
            if (filename && filename !== path.basename(local)) {
                return
            }
            clearTimeout(timer)
            timer = setTimeout(async () => {
                const mtime = await fsp.stat(local).then(s => s.mtimeMs, () => null)
                if (mtime === null || mtime === lastSent) {
                    return
                }
                lastSent = mtime
                try {
                    await this.upload(local, remotePath)
                    this.notifications.info(this.translate.instant('Saved {name} on {machine}', { name: posixPath.basename(remotePath), machine: this.machineName }))
                } catch (error) {
                    this.notifications.error(this.translate.instant('Could not save {name} on {machine}', { name: posixPath.basename(remotePath), machine: this.machineName }), String(error.message ?? error))
                }
            }, SAVE_SETTLE_TIME)
        })
        this.watchers.set(remotePath, watcher)
    }
}
