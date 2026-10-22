import { Component, HostBinding, HostListener, Input } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import deepClone from 'clone-deep'
import FuzzySearch from 'fuzzy-search'

import { ConfigService } from '../services/config.service'
import { ProfilesService } from '../services/profiles.service'
import { AppService } from '../services/app.service'
import { PlatformService } from '../api/platform'
import { ProfileProvider } from '../api/index'
import { PartialProfileGroup, ProfileGroup, PartialProfile, Profile } from '../index'
import { TailscaleService, TailscaleMachine, TailscaleState } from '../services/tailscale.service'
import { ClaudeLauncherService } from '../services/claudeLauncher.service'
import { BaseComponent } from './base.component'
import { TailscaleMachineModalComponent } from './tailscaleMachineModal.component'
import { PromptModalComponent } from './promptModal.component'

interface CollapsableProfileGroup extends ProfileGroup {
    collapsed: boolean
    children: PartialProfileGroup<CollapsableProfileGroup>[]
}

/** @hidden */
@Component({
    selector: 'profile-tree',
    styleUrls: ['./profileTree.component.scss'],
    templateUrl: './profileTree.component.pug',
})
export class ProfileTreeComponent extends BaseComponent {
    profileGroups: PartialProfileGroup<ProfileGroup>[] = []
    rootGroups: PartialProfileGroup<ProfileGroup>[] = []

    filteredProfiles: PartialProfile<Profile>[] = []
    @Input() filter = ''

    machines: TailscaleMachine[] = []
    visibleMachines: TailscaleMachine[] = []
    hiddenOfflineCount = 0
    tailscaleState: TailscaleState = 'loading'
    tailscaleCollapsed = window.localStorage.tailscaleCollapsed === 'true'


    panelMinWidth = 200
    panelMaxWidth = 600
    panelInternalWidth: number = parseInt(window.localStorage.profileTreeWidth ?? '300')
    panelStartWidth = this.panelInternalWidth
    panelIsResizing = false
    panelStartX = 0

    constructor (
        private app: AppService,
        private platform: PlatformService,
        private config: ConfigService,
        private profilesService: ProfilesService,
        private translate: TranslateService,
        private ngbModal: NgbModal,
        private tailscale: TailscaleService,
        private claude: ClaudeLauncherService,
    ) {
        super()
    }

    get tailscaleError (): string {
        return this.tailscale.error
    }

    ngOnDestroy (): void {
        this.tailscale.stop()
        super.ngOnDestroy()
    }

    async ngOnInit (): Promise<void> {
        this.subscribeUntilDestroyed(this.tailscale.machines$, machines => {
            this.machines = machines
            this.updateVisibleMachines()
        })
        this.subscribeUntilDestroyed(this.tailscale.state$, state => this.tailscaleState = state)
        this.tailscale.start()

        await this.loadTreeItems()
        this.subscribeUntilDestroyed(this.config.changed$, () => {
            this.loadTreeItems()
            this.updateVisibleMachines()
        })
        this.app.tabsChanged$.subscribe(() => this.tabStateChanged())
        this.app.activeTabChange$.subscribe(() => this.tabStateChanged())
    }


    private async loadTreeItems (): Promise<void> {
        const profileGroupCollapsed = JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')
        let groups = await this.profilesService.getProfileGroups({ includeNonUserGroup: true, includeProfiles: true })

        for (const group of groups) {
            if (group.profiles?.length) {
                // remove template profiles
                group.profiles = group.profiles.filter(x => !x.isTemplate)

                // remove blocklisted profiles
                group.profiles = group.profiles.filter(x => x.id && !this.config.store.profileBlacklist.includes(x.id))
            }
        }

        // Local shells stay reachable from the new tab button; the side panel is for remote machines
        groups = groups.filter(g => g.id !== 'built-in')
        groups = groups.filter(g => g.editable || g.profiles?.length || g.id === 'ungrouped')
        const ungrouped = groups.find(g => g.id === 'ungrouped')
        if (ungrouped) {
            ungrouped.name = this.translate.instant('SSH connections')
            ungrouped.icon = 'fas fa-server'
        }

        groups.sort((a, b) => a.name.localeCompare(b.name))
        groups.sort((a, b) => (a.id === 'built-in' || !a.editable ? 1 : 0) - (b.id === 'built-in' || !b.editable ? 1 : 0))
        groups.sort((a, b) => (a.id === 'ungrouped' ? 0 : 1) - (b.id === 'ungrouped' ? 0 : 1))
        this.profileGroups = groups.map(g => ProfileTreeComponent.intoPartialCollapsableProfileGroup(g, profileGroupCollapsed[g.id] ?? false))
        this.rootGroups = this.profilesService.buildGroupTree(this.profileGroups)
    }

    private async showProfileEditModal (profile: PartialProfile<Profile>): Promise<PartialProfile<Profile>|null> {
        const { EditProfileModalComponent } = window['nodeRequire']('tabby-settings')
        const modal = this.ngbModal.open(
            EditProfileModalComponent,
            { size: 'lg' },
        )

        const provider = this.profilesService.providerForProfile(profile)
        if (!provider) { throw new Error('Cannot edit a profile without a provider') }

        modal.componentInstance.partialProfile = deepClone({ ...profile })
        modal.componentInstance.profileProvider = provider

        const result = await modal.result.catch(() => null)
        if (!result) { return null }

        result.type = provider.id
        return result
    }

    private async editProfile (profile: PartialProfile<Profile>): Promise<void> {
        const result = await this.showProfileEditModal(profile)
        if (!result) { return }

        await this.profilesService.writeProfile(result)
        await this.config.save()
    }

    async newSSHConnection (): Promise<void> {
        const profiles = await this.profilesService.getProfiles({ includeBuiltin: true })
        const template = profiles.find(p => p.id === 'ssh:template')
        if (!template) { return }

        const base: PartialProfile<Profile> = deepClone(template)
        delete base.id
        base.name = ''
        base.isBuiltin = false
        base.isTemplate = false

        const result = await this.showProfileEditModal(base)
        if (!result) { return }

        if (!result.name) {
            const cfgProxy = this.profilesService.getConfigProxyForProfile(result)
            result.name = this.profilesService.providerForProfile(result)?.getSuggestedName(cfgProxy) ?? 'SSH'
        }
        await this.profilesService.newProfile(result)
        await this.config.save()
    }

    private async editProfileGroup (group: PartialProfileGroup<CollapsableProfileGroup>): Promise<void> {
        const { EditProfileGroupModalComponent } = window['nodeRequire']('tabby-settings')

        const modal = this.ngbModal.open(
            EditProfileGroupModalComponent,
            { size: 'lg' },
        )

        modal.componentInstance.group = deepClone(group)
        modal.componentInstance.providers = this.profilesService.getProviders()

        const result: PartialProfileGroup<ProfileGroup & { group: PartialProfileGroup<CollapsableProfileGroup>, provider?: ProfileProvider<Profile> }> | null = await modal.result.catch(() => null)
        if (!result) { return }
        if (!result.group) { return }

        if (result.provider) {
            return this.editProfileGroupDefaults(result.group, result.provider)
        }

        delete result.group.collapsed
        delete result.group.children
        await this.profilesService.writeProfileGroup(result.group)
        await this.config.save()
    }

    private async editProfileGroupDefaults (group: PartialProfileGroup<CollapsableProfileGroup>, provider: ProfileProvider<Profile>): Promise<void> {
        const { EditProfileModalComponent } = window['nodeRequire']('tabby-settings')

        const modal = this.ngbModal.open(
            EditProfileModalComponent,
            { size: 'lg' },
        )
        const model = group.defaults?.[provider.id] ?? {}
        model.type = provider.id
        modal.componentInstance.profile = Object.assign({}, model)
        modal.componentInstance.profileProvider = provider
        modal.componentInstance.defaultsMode = 'group'

        const result = await modal.result.catch(() => null)
        if (result) {
            // Fully replace the config
            for (const k in model) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete model[k]
            }
            Object.assign(model, result)
            if (!group.defaults) {
                group.defaults = {}
            }
            group.defaults[provider.id] = model
        }
        return this.editProfileGroup(group)
    }

    async profileContextMenu (profile: PartialProfile<Profile>, event: MouseEvent): Promise<void> {
        event.preventDefault()

        this.platform.popupContextMenu([
            {
                type: 'normal',
                label: this.translate.instant('Run'),
                click: () => this.launchProfile(profile),
            },
            ...profile.type === 'ssh' ? [{
                type: 'normal' as const,
                label: this.translate.instant('Start Claude Code'),
                click: () => this.launchClaude(profile),
            }] : [],
            {
                type: 'normal',
                label: this.translate.instant('Edit profile'),
                click: () => this.editProfile(profile),
                enabled: !(profile.isBuiltin ?? profile.isTemplate),
            },
            {
                type: 'normal',
                label: this.translate.instant('Delete'),
                click: () => this.deleteProfile(profile),
                enabled: !(profile.isBuiltin ?? profile.isTemplate),
            },
        ])
    }

    private async deleteProfile (profile: PartialProfile<Profile>): Promise<void> {
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Delete "{name}"?', profile),
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response === 0) {
            await this.profilesService.deleteProfile(profile)
            await this.config.save()
        }
    }

    async groupContextMenu (group: PartialProfileGroup<CollapsableProfileGroup>, event: MouseEvent): Promise<void> {
        event.preventDefault()
        this.platform.popupContextMenu([
            {
                type: 'normal',
                label: group.collapsed ? this.translate.instant('Expand group') : this.translate.instant('Collapse group'),
                click: () => this.toggleGroupCollapse(group),
            },
            {
                type: 'normal',
                label: this.translate.instant('Edit group'),
                click: () => this.editProfileGroup(group),
                enabled: group.editable,
            },
        ])
    }

    private async tabStateChanged (): Promise<void> {
        // TODO: show active tab in the side panel with eye icon
    }

    async launchProfile<P extends Profile> (profile: PartialProfile<P>): Promise<any> {
        return this.profilesService.launchProfile(profile)
    }

    async launchClaude (profile: PartialProfile<Profile>): Promise<void> {
        await this.claude.openClaude(profile)
    }

    ////// TAILSCALE //////
    refreshTailscale (): void {
        this.tailscale.refresh()
    }

    toggleTailscaleCollapse (): void {
        this.tailscaleCollapsed = !this.tailscaleCollapsed
        window.localStorage.tailscaleCollapsed = String(this.tailscaleCollapsed)
    }

    async toggleShowOffline (): Promise<void> {
        this.config.store.tsugite.showOffline = !this.config.store.tsugite.showOffline
        await this.config.save()
    }

    private updateVisibleMachines (): void {
        const q = this.filter.trim().toLowerCase()
        const matching = this.machines.filter(m => !q || m.name.toLowerCase().includes(q) || m.dnsName.toLowerCase().includes(q))
        this.visibleMachines = this.config.store.tsugite.showOffline ? matching : matching.filter(m => m.online)
        this.hiddenOfflineCount = matching.length - this.visibleMachines.length
    }

    async openMachineTerminal (machine: TailscaleMachine): Promise<void> {
        await this.claude.openTerminal(this.tailscale.toProfile(machine))
    }

    async openMachineClaude (machine: TailscaleMachine): Promise<void> {
        await this.claude.openClaude(this.tailscale.toProfile(machine))
    }

    async editMachine (machine: TailscaleMachine): Promise<void> {
        const modal = this.ngbModal.open(TailscaleMachineModalComponent)
        modal.componentInstance.machine = machine
        modal.componentInstance.settings = this.tailscale.getSettings(machine)
        modal.componentInstance.defaultUser = this.tailscale.toProfile({ ...machine, name: '' }).options.user
        const result = await modal.result.catch(() => null)
        if (result) {
            await this.tailscale.saveSettings(machine, result)
        }
    }

    /** Copies the machine into the saved SSH connections, where every SSH option (port forwarding etc.) is available */
    async saveMachineAsProfile (machine: TailscaleMachine): Promise<void> {
        const profile = this.tailscale.toProfile(machine)
        profile.options.host = machine.dnsName
        await this.profilesService.newProfile(profile)
        await this.config.save()
    }

    machineContextMenu (machine: TailscaleMachine, event: MouseEvent): void {
        event.preventDefault()
        this.platform.popupContextMenu([
            {
                type: 'normal',
                label: this.translate.instant('Open terminal'),
                click: () => this.openMachineTerminal(machine),
            },
            {
                type: 'normal',
                label: this.translate.instant('Start Claude Code'),
                click: () => this.openMachineClaude(machine),
            },
            { type: 'separator' },
            {
                type: 'normal',
                label: this.translate.instant('Settings'),
                click: () => this.editMachine(machine),
            },
            {
                type: 'normal',
                label: this.translate.instant('Save as SSH connection'),
                click: () => this.saveMachineAsProfile(machine),
            },
            {
                type: 'normal',
                label: this.translate.instant('Copy address'),
                click: () => this.platform.setClipboard({ text: machine.dnsName }),
            },
        ])
    }

    tailscaleContextMenu (event: MouseEvent): void {
        event.preventDefault()
        this.platform.popupContextMenu([
            {
                type: 'normal',
                label: this.translate.instant('Refresh'),
                click: () => this.refreshTailscale(),
            },
            {
                type: 'checkbox',
                label: this.translate.instant('Show offline machines'),
                checked: this.config.store.tsugite.showOffline,
                click: () => this.toggleShowOffline(),
            },
            {
                type: 'normal',
                label: this.translate.instant('Default username…'),
                click: () => this.editDefaultUser(),
            },
        ])
    }

    private async editDefaultUser (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.prompt = this.translate.instant('Username used when a machine has none set')
        modal.componentInstance.value = this.config.store.tsugite.defaultUser
        const result = await modal.result.catch(() => null)
        if (result) {
            this.config.store.tsugite.defaultUser = result.value.trim()
            await this.config.save()
        }
    }

    async onFilterChange (): Promise<void> {
        this.updateVisibleMachines()
        try {
            const q = this.filter.trim().toLowerCase()

            if (q.length === 0) {
                this.rootGroups = this.profilesService.buildGroupTree(this.profileGroups)
                return
            }

            const profiles = await this.profilesService.getProfiles({
                includeBuiltin: this.config.store.terminal.showBuiltinProfiles,
                clone: true,
            })

            const matches = new FuzzySearch(
                profiles.filter(p => !p.isTemplate),
                ['name', 'description'],
                { sort: false },
            ).search(q)

            this.rootGroups = [
                {
                    id: 'search',
                    editable: false,
                    name: this.translate.instant('Filter results'),
                    icon: 'fas fa-magnifying-glass',
                    profiles: matches,
                },
            ]
        } catch (error) {
            console.error('Error occurred during search:', error)
        }
    }

    ////// RESIZING //////
    startResize (event: MouseEvent): void {
        this.panelIsResizing = true
        this.panelStartX = event.clientX
        this.panelStartWidth = this.panelWidth
        event.preventDefault()
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove (event: MouseEvent): void {
        if (!this.panelIsResizing) { return }
        const delta = event.clientX - this.panelStartX
        const width = Math.min(Math.max(this.panelMinWidth, this.panelStartWidth + delta), this.panelMaxWidth)
        this.panelWidth = width
        window.localStorage.profileTreeWidth = width
    }

    @HostListener('document:mouseup')
    stopResize (): boolean {
        this.panelIsResizing = false
        return true
    }

    @HostBinding('style.width.px')
    get panelWidth (): number {
        return this.panelInternalWidth
    }

    set panelWidth (value: number) {
        this.panelInternalWidth = value
    }

    ////// GROUP COLLAPSING //////
    toggleGroupCollapse (group: PartialProfileGroup<CollapsableProfileGroup>): void {
        group.collapsed = !group.collapsed
        this.saveProfileGroupCollapse(group)
    }

    private saveProfileGroupCollapse (group: PartialProfileGroup<CollapsableProfileGroup>): void {
        const profileGroupCollapsed = JSON.parse(window.localStorage.profileGroupCollapsed ?? '{}')
        profileGroupCollapsed[group.id] = group.collapsed
        window.localStorage.profileGroupCollapsed = JSON.stringify(profileGroupCollapsed)
    }

    private static intoPartialCollapsableProfileGroup (group: PartialProfileGroup<ProfileGroup>, collapsed: boolean): PartialProfileGroup<CollapsableProfileGroup> {
        const collapsableGroup = {
            ...group,
            collapsed,
        }
        return collapsableGroup
    }

}
