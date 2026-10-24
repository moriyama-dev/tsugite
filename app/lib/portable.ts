import * as path from 'path'
import * as fs from 'fs'
import * as electron from 'electron'

electron.app.setName('Tsugite')
electron.app.setPath('userData', path.join(electron.app.getPath('appData'), 'tsugite'))
// A config directory given from outside (a test run, a second profile) keeps all of its
// state there too: the tab recovery in localStorage and the single instance lock
if (process.env.TABBY_CONFIG_DIRECTORY) {
    electron.app.setPath('userData', path.resolve(process.env.TABBY_CONFIG_DIRECTORY))
}
fs.mkdirSync(electron.app.getPath('userData'), { recursive: true })

const appPath = path.dirname(electron.app.getPath('exe'))

const portableData = path.join(appPath, 'data')
if (fs.existsSync(portableData)) {
    console.log('reset user data to ' + portableData)
    electron.app.setPath('userData', portableData)
}
