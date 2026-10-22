import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { ToastrModule } from 'ngx-toastr'
import TabbyCoreModule, { ConfigProvider, TabRecoveryProvider, HotkeyProvider, ProfileProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import TabbyTerminalModule from 'tabby-terminal'

import { SSHProfileSettingsComponent } from './components/sshProfileSettings.component'
import { SSHPortForwardingModalComponent } from './components/sshPortForwardingModal.component'
import { SSHPortForwardingConfigComponent } from './components/sshPortForwardingConfig.component'
import { SSHSettingsTabComponent } from './components/sshSettingsTab.component'
import { SSHTabComponent } from './components/sshTab.component'
import { KeyboardInteractiveAuthComponent } from './components/keyboardInteractiveAuthPanel.component'
import { HostKeyPromptModalComponent } from './components/hostKeyPromptModal.component'

import { SSHConfigProvider } from './config'
import { SSHSettingsTabProvider } from './settings'
import { RecoveryProvider } from './recoveryProvider'
import { SSHHotkeyProvider } from './hotkeys'
import { SSHProfilesService } from './profiles'

/** @hidden */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        ToastrModule,
        TabbyCoreModule,
        TabbyTerminalModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: SSHConfigProvider, multi: true },
        { provide: SettingsTabProvider, useClass: SSHSettingsTabProvider, multi: true },
        { provide: TabRecoveryProvider, useClass: RecoveryProvider, multi: true },
        { provide: HotkeyProvider, useClass: SSHHotkeyProvider, multi: true },
        { provide: ProfileProvider, useExisting: SSHProfilesService, multi: true },
    ],
    declarations: [
        SSHProfileSettingsComponent,
        SSHPortForwardingModalComponent,
        SSHPortForwardingConfigComponent,
        SSHSettingsTabComponent,
        SSHTabComponent,
        KeyboardInteractiveAuthComponent,
        HostKeyPromptModalComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class SSHModule { }

export * from './api'
export { SFTPFile, SFTPSession } from './session/sftp'
export { SSHTabComponent }
export { PasswordStorageService } from './services/passwordStorage.service'
