import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { FileProvidersService } from '../services/fileProviders.service'
import { TailscaleMachine, TailscaleMachineSettings } from '../services/tailscale.service'

/** @hidden */
@Component({
    templateUrl: './tailscaleMachineModal.component.pug',
})
export class TailscaleMachineModalComponent {
    @Input() machine: TailscaleMachine
    @Input() settings: TailscaleMachineSettings
    @Input() defaultUser: string

    constructor (
        private modalInstance: NgbActiveModal,
        private fileProviders: FileProvidersService,
    ) { }

    ngOnInit (): void {
        this.settings.auth ??= this.machine.tailscaleSSH ? 'tailscale' : 'key'
    }

    async pickPrivateKey (): Promise<void> {
        const ref = await this.fileProviders.selectAndStoreFile(`private key for ${this.machine.name}`).catch(() => null)
        if (ref) {
            this.settings.privateKey = ref
        }
    }

    ok (): void {
        this.modalInstance.close(this.settings)
    }

    cancel (): void {
        this.modalInstance.dismiss()
    }
}
