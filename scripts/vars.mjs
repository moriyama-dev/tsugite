import * as path from 'path'
import * as fs from 'fs'

process.env.ARCH = ((process.env.ARCH || process.arch) === 'arm') ? 'armv7l' : (process.env.ARCH || process.arch)

import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const electronInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../node_modules/electron/package.json')))

// Tsugite versions itself independently of upstream Tabby; the release tag must match this
export const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app/package.json'))).version

export const builtinPlugins = [
    'tabby-core',
    'tabby-settings',
    'tabby-terminal',
    'tabby-community-color-schemes',
    'tabby-ssh',
    'tabby-local',
    'tabby-electron',
    'tabby-linkifier',
    'tabby-auto-sudo-password',
]

export const packagesWithDocs = [
    ['.', 'tabby-core'],
    ['terminal', 'tabby-terminal'],
    ['local', 'tabby-local'],
    ['settings', 'tabby-settings'],
]

export const allPackages = [
    ...builtinPlugins,
]

export const bundledModules = [
    '@angular',
    '@ng-bootstrap',
]
export const electronVersion = electronInfo.version
