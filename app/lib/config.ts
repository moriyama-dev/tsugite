import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { writeFile } from 'atomically'


export const configPath = path.join(process.env.TABBY_CONFIG_DIRECTORY!, 'config.yaml')
const tabbyConfigPath = path.join(process.env.TABBY_CONFIG_DIRECTORY!, '../tabby', 'config.yaml')


export function migrateConfig (): void {
    // On the very first run, start from the user's Tabby config so saved SSH profiles carry over
    if (!fs.existsSync(configPath) && fs.existsSync(tabbyConfigPath)) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true })
        fs.writeFileSync(configPath, fs.readFileSync(tabbyConfigPath))
    }
}

export function loadConfig (): any {
    migrateConfig()

    if (fs.existsSync(configPath)) {
        return yaml.load(fs.readFileSync(configPath, 'utf8'))
    } else {
        return {}
    }
}

export async function saveConfig (content: string): Promise<void> {
    await writeFile(configPath, content, { encoding: 'utf8' })
    await writeFile(configPath + '.backup', content, { encoding: 'utf8' })
}
