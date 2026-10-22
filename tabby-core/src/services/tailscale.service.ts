import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { execFile } from 'child_process'
import { HostAppService, Platform } from '../api/hostApp'
import { ConfigService } from './config.service'

export interface TailscaleMachine {
    /** First label of the MagicDNS name; unique within the tailnet, so it doubles as the settings key */
    name: string
    dnsName: string
    ip: string
    os: string
    online: boolean
    /** The machine advertises SSH host keys, i.e. Tailscale SSH is enabled on it */
    tailscaleSSH: boolean
}

export interface TailscaleMachineSettings {
    user?: string
    auth?: 'tailscale' | 'key'
    privateKey?: string
    workdir?: string
}

export type TailscaleState = 'loading' | 'ready' | 'not-installed' | 'stopped' | 'error'

const REFRESH_INTERVAL = 30000

@Injectable({ providedIn: 'root' })
export class TailscaleService {
    get machines$ (): Observable<TailscaleMachine[]> { return this.machines }
    get state$ (): Observable<TailscaleState> { return this.state }
    error = ''

    private machines = new BehaviorSubject<TailscaleMachine[]>([])
    private state = new BehaviorSubject<TailscaleState>('loading')
    private binary: string | null = null
    private timer: number | null = null

    constructor (
        private config: ConfigService,
        private hostApp: HostAppService,
    ) { }

    /** Starts polling while at least one view is interested */
    start (): void {
        if (this.timer !== null) {
            return
        }
        this.refresh()
        this.timer = window.setInterval(() => this.refresh(), REFRESH_INTERVAL)
    }

    stop (): void {
        if (this.timer !== null) {
            window.clearInterval(this.timer)
            this.timer = null
        }
    }

    async refresh (): Promise<void> {
        let output = ''
        try {
            output = await this.run(['status', '--json'])
        } catch (e) {
            if (e.code === 'ENOENT') {
                this.state.next('not-installed')
            } else {
                this.error = String(e.message ?? e).trim()
                this.state.next(this.error.includes('stopped') || this.error.includes('not running') ? 'stopped' : 'error')
            }
            this.machines.next([])
            return
        }

        const status = JSON.parse(output)
        if (status.BackendState !== 'Running') {
            this.state.next('stopped')
            this.machines.next([])
            return
        }

        const machines: TailscaleMachine[] = Object.values(status.Peer ?? {}).map((peer: any) => {
            const dnsName = (peer.DNSName ?? '').replace(/\.$/, '')
            return {
                name: dnsName.split('.')[0] || peer.HostName,
                dnsName,
                ip: (peer.TailscaleIPs ?? []).find(x => !x.includes(':')) ?? peer.TailscaleIPs?.[0] ?? '',
                os: peer.OS ?? '',
                online: !!peer.Online,
                tailscaleSSH: !!peer.sshHostKeys?.length,
            }
        })
        machines.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
        this.machines.next(machines)
        this.state.next('ready')
    }

    getSettings (machine: TailscaleMachine): TailscaleMachineSettings {
        return { ...this.config.store.tsugite.machines[machine.name] ?? {} }
    }

    async saveSettings (machine: TailscaleMachine, settings: TailscaleMachineSettings): Promise<void> {
        this.config.store.tsugite.machines[machine.name] = settings
        await this.config.save()
    }

    /** Builds the SSH profile used to open a terminal on the machine */
    toProfile (machine: TailscaleMachine): any {
        const settings = this.getSettings(machine)
        const auth = settings.auth ?? (machine.tailscaleSSH ? 'tailscale' : 'key')
        return {
            type: 'ssh',
            name: machine.name,
            icon: 'fas fa-network-wired',
            options: {
                host: machine.ip,
                port: 22,
                // Empty strings mean "not set", so fall through them as well
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                user: settings.user || this.config.store.tsugite.defaultUser || this.localUser(),
                // Leaving auth unset tries "none" first (which is how Tailscale SSH logs in), then the agent and keys
                auth: null,
                privateKeys: auth === 'key' && settings.privateKey ? [settings.privateKey] : [],
                claudeWorkdir: settings.workdir ?? '',
            },
        }
    }

    private localUser (): string {
        return process.env.USER ?? process.env.LOGNAME ?? 'root'
    }

    private async run (args: string[]): Promise<string> {
        if (this.binary) {
            return this.execFile(this.binary, args)
        }
        let lastError: any = null
        for (const candidate of this.candidates()) {
            try {
                const result = await this.execFile(candidate, args)
                this.binary = candidate
                return result
            } catch (e) {
                lastError = e
                if (e.code !== 'ENOENT') {
                    // The binary exists but complained (e.g. tailscaled is not running)
                    this.binary = candidate
                    throw e
                }
            }
        }
        throw lastError
    }

    private candidates (): string[] {
        if (this.hostApp.platform === Platform.macOS) {
            // Apps launched from Finder get a minimal PATH, so look in the usual install locations too
            return [
                'tailscale',
                '/opt/homebrew/bin/tailscale',
                '/usr/local/bin/tailscale',
                '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
            ]
        }
        return ['tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale', '/snap/bin/tailscale']
    }

    private execFile (file: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            execFile(file, args, { timeout: 10000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    if (stderr) {
                        error.message = stderr.toString()
                    }
                    reject(error)
                    return
                }
                resolve(stdout.toString())
            })
        })
    }
}
