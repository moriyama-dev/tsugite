import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildShellIntegrationInstaller } from '../src/shellIntegration/installer.ts'

const dir = path.join(import.meta.dirname, '../src/shellIntegration')
const installer = buildShellIntegrationInstaller({
    bash: fs.readFileSync(path.join(dir, 'tsugite.bash'), 'utf8'),
    zsh: fs.readFileSync(path.join(dir, 'tsugite.zsh'), 'utf8'),
    fish: fs.readFileSync(path.join(dir, 'tsugite.fish'), 'utf8'),
})

function run (home: string, shell: string): void {
    execFileSync('sh', ['-s'], { input: installer, env: { HOME: home, SHELL: shell, PATH: process.env.PATH } })
}

function tempHome (): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'tsugite-shell-integration-'))
}

describe('shell integration installer', () => {
    it('writes the hooks and adds one line to .bashrc, keeping what was there', () => {
        const home = tempHome()
        fs.writeFileSync(path.join(home, '.bashrc'), 'alias ll="ls -l"')
        run(home, '/bin/bash')
        run(home, '/bin/bash')
        const rc = fs.readFileSync(path.join(home, '.bashrc'), 'utf8')
        assert.ok(rc.startsWith('alias ll="ls -l"\n[ -f "$HOME/.config/tsugite/tsugite.bash" ] && . "$HOME/.config/tsugite/tsugite.bash"'))
        assert.equal(rc.split('tsugite/tsugite.bash" ] &&').length, 2, 'the line is added once')
        assert.equal(fs.readFileSync(path.join(home, '.config/tsugite/tsugite.bash'), 'utf8'), fs.readFileSync(path.join(dir, 'tsugite.bash'), 'utf8'))
        assert.ok(!fs.existsSync(path.join(home, '.zshrc')), 'zsh is left alone when it is not used')
        assert.ok(!fs.existsSync(path.join(home, '.config/fish')), 'fish is left alone when it is not used')
    })

    it('also loads it from a .bash_profile that does not load .bashrc', () => {
        const home = tempHome()
        fs.writeFileSync(path.join(home, '.bash_profile'), 'export A=1\n')
        run(home, '/bin/bash')
        assert.match(fs.readFileSync(path.join(home, '.bash_profile'), 'utf8'), /^export A=1\n\[ -f .*tsugite\.bash/)
        const home2 = tempHome()
        fs.writeFileSync(path.join(home2, '.bash_profile'), '. ~/.bashrc\n')
        run(home2, '/bin/bash')
        assert.equal(fs.readFileSync(path.join(home2, '.bash_profile'), 'utf8'), '. ~/.bashrc\n')
    })

    it('creates .zshrc for a zsh user and puts the fish hook in conf.d', () => {
        const home = tempHome()
        run(home, '/bin/zsh')
        assert.match(fs.readFileSync(path.join(home, '.zshrc'), 'utf8'), /^\[ -f "\$HOME\/\.config\/tsugite\/tsugite\.zsh" \]/)
        const fishHome = tempHome()
        run(fishHome, '/usr/bin/fish')
        assert.equal(fs.readFileSync(path.join(fishHome, '.config/fish/conf.d/tsugite.fish'), 'utf8'), fs.readFileSync(path.join(dir, 'tsugite.fish'), 'utf8'))
        assert.ok(!fs.existsSync(path.join(fishHome, '.bashrc')))
    })
})
