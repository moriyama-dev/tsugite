import * as fs from 'fs/promises'
import * as path from 'path'
import { ExplorerEntry, ExplorerFileSystem } from '../api/explorer'
import { PlatformService } from '../api/platform'

/** The files of this computer, for local terminals */
export class LocalExplorerFileSystem implements ExplorerFileSystem {
    readonly local = true

    constructor (private platform: PlatformService) { }

    async list (dir: string): Promise<ExplorerEntry[]> {
        const dirents = await fs.readdir(dir, { withFileTypes: true })
        const entries = await Promise.all(dirents.map(async dirent => {
            const full = path.join(dir, dirent.name)
            // stat follows symlinks, so a link to a folder opens like one; a broken link stays a file
            const stats = await fs.stat(full).catch(() => fs.lstat(full).catch(() => null))
            return {
                name: dirent.name,
                path: full,
                isDirectory: stats?.isDirectory() ?? dirent.isDirectory(),
                isSymlink: dirent.isSymbolicLink(),
                size: stats?.size ?? 0,
                mode: stats?.mode ?? 0,
                modified: stats?.mtime ?? null,
            }
        }))
        return entries
    }

    async exists (p: string): Promise<boolean> {
        return fs.lstat(p).then(() => true, () => false)
    }

    async createFile (p: string): Promise<void> {
        // "wx" fails if something is already there
        await (await fs.open(p, 'wx')).close()
    }

    async createDirectory (p: string): Promise<void> {
        await fs.mkdir(p)
    }

    async rename (from: string, to: string): Promise<void> {
        if (await this.exists(to)) {
            throw new Error(`${path.basename(to)} already exists`)
        }
        await fs.rename(from, to)
    }

    async delete (entry: ExplorerEntry): Promise<void> {
        await this.platform.trashItem(entry.path)
    }

    async open (entry: ExplorerEntry): Promise<void> {
        this.platform.openPath(entry.path)
    }

    reveal (entry: ExplorerEntry): void {
        this.platform.showItemInFolder(entry.path)
    }
}
