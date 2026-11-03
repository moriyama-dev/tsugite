import { Observable } from 'rxjs'

/** A file or folder shown in the explorer */
export interface ExplorerEntry {
    name: string
    /** Absolute path on the machine the terminal runs on */
    path: string
    /** A symlink to a folder counts as a folder */
    isDirectory: boolean
    isSymlink: boolean
    size: number
    /** Unix permission bits, 0 when unknown */
    mode: number
    modified: Date | null
}

/** The files of the machine a terminal runs on: this computer, or an SSH server over SFTP */
export interface ExplorerFileSystem {
    readonly local: boolean
    list: (dir: string) => Promise<ExplorerEntry[]>
    exists: (path: string) => Promise<boolean>
    createFile: (path: string) => Promise<void>
    createDirectory: (path: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
    /** On this computer it goes to the trash; on a server it is gone for good */
    delete: (entry: ExplorerEntry) => Promise<void>
    /** Opens it in the app the OS picks; a remote file is fetched first and sent back when it is saved */
    open: (entry: ExplorerEntry) => Promise<void>
    /** Shows it in the OS file manager (this computer only) */
    reveal?: (entry: ExplorerEntry) => void
}

/** What a terminal tab offers the explorer */
export interface ExplorerSource {
    readonly fileSystem: ExplorerFileSystem
    /** Fires when the folder may have changed: the shell reported it, or the output went quiet */
    readonly changed$: Observable<void>
    /** The folder the shell is in, or null while it is not known */
    getCwd: () => Promise<string | null>
    /** Shown while the shell has not said where it is (the home folder) */
    getFallbackDirectory: () => Promise<string | null>
    /** Types a `cd` into the terminal */
    changeDirectory: (path: string) => void
}

/** Implemented by tabs that can show their files in the explorer */
export interface ExplorerSourceProvider {
    getExplorerSource: () => ExplorerSource | null
}

export function isExplorerSourceProvider (tab: unknown): tab is ExplorerSourceProvider {
    return typeof (tab as Partial<ExplorerSourceProvider> | null)?.getExplorerSource === 'function'
}
