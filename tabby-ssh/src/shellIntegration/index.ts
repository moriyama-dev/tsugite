/* eslint-disable @typescript-eslint/no-var-requires */
import { buildShellIntegrationInstaller } from './installer'

/** The installer with the hooks bundled in (webpack loads the files as text) */
export const SHELL_INTEGRATION_INSTALLER = buildShellIntegrationInstaller({
    bash: require('./tsugite.bash'),
    zsh: require('./tsugite.zsh'),
    fish: require('./tsugite.fish'),
})
