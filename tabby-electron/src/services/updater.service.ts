import { Injectable } from '@angular/core'
import { UpdaterService } from 'tabby-core'

/** Updates are delivered through apt (Linux) and Homebrew (macOS), so the app never updates itself */
@Injectable()
export class ElectronUpdaterService extends UpdaterService {
    async check (): Promise<boolean> {
        return false
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async update (): Promise<void> { }
}
