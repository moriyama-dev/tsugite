#!/usr/bin/env node
// Launches a packaged build and checks that it comes up: the window loads, a local
// terminal opens with a running shell, the Tailscale section settles and nothing crashes.
//
// usage: node scripts/launch-test.mjs <app executable> [screenshot.png]
//
// The app runs with a throwaway config directory, which also holds its localStorage and
// single instance lock, so it runs beside an open Tsugite without touching its tabs.
// It talks only to the local CDP port and uses no credentials.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const [exe, screenshot] = process.argv.slice(2)
if (!exe) {
    console.error('usage: launch-test.mjs <app executable> [screenshot.png]')
    process.exit(2)
}

const PORT = 9333
const sleep = ms => new Promise(r => setTimeout(r, ms))

const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsugite-launch-test-'))
// Skip the welcome tab so a local terminal opens at once
fs.writeFileSync(path.join(configDir, 'config.yaml'), 'version: 7\nenableWelcomeTab: false\nterminal:\n  autoOpen: true\n')
const logPath = path.join(configDir, 'app.log')
const log = fs.openSync(logPath, 'w')

const args = [`--remote-debugging-port=${PORT}`, '--enable-logging=stderr']
if (process.platform === 'linux') {
    args.push('--no-sandbox')
}
const app = spawn(exe, args, {
    env: { ...process.env, TABBY_CONFIG_DIRECTORY: configDir },
    stdio: ['ignore', log, log],
})
let exited = null
app.on('exit', (code, signal) => { exited = { code, signal } })

const failures = []
function check (ok, message) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`)
    if (!ok) {
        failures.push(message)
    }
}

async function waitFor (what, timeoutMs, fn) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        if (exited) {
            return null
        }
        try {
            const value = await fn()
            if (value) {
                return value
            }
        } catch { }
        if (Date.now() > deadline) {
            return null
        }
        await sleep(500)
    }
}

let ws = null
let nextId = 1
async function evaluate (expression) {
    const id = nextId++
    return new Promise((resolve, reject) => {
        const onMessage = m => {
            const d = JSON.parse(m.data)
            if (d.id === id) {
                ws.removeEventListener('message', onMessage)
                if (d.result?.exceptionDetails) {
                    reject(new Error(d.result.exceptionDetails.text))
                } else {
                    resolve(d.result?.result?.value)
                }
            }
        }
        ws.addEventListener('message', onMessage)
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
    })
}

/** The processes started by the app, at any depth */
function descendants (pid) {
    const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm=']).toString().trim().split('\n')
        .map(line => line.trim().split(/\s+/))
        .map(([p, pp, ...comm]) => ({ pid: +p, ppid: +pp, comm: comm.join(' ') }))
    const found = []
    const queue = [pid]
    while (queue.length) {
        const parent = queue.shift()
        for (const row of rows.filter(r => r.ppid === parent)) {
            found.push(row)
            queue.push(row.pid)
        }
    }
    return found
}

try {
    const page = await waitFor('the window', 60000, async () => {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
        return targets.find(t => t.type === 'page')
    })
    check(!!page, 'the app window opened')
    if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
            ws.onopen = resolve
            ws.onerror = reject
        })

        const terminal = await waitFor('a terminal', 30000, () => evaluate('!!document.querySelector("terminalTab .xterm")'))
        check(!!terminal, 'a local terminal tab opened')

        const shell = await waitFor('a shell', 30000, () => descendants(app.pid).find(p => /(^|\/)-?(zsh|bash|sh|fish)$/.test(p.comm)))
        check(!!shell, `a shell is running under the app${shell ? ` (${shell.comm})` : ''}`)

        // The Tailscale section must leave "Loading…" (it times out after 10 s at worst)
        const notes = await waitFor('the Tailscale section', 30000, async () => {
            const texts = await evaluate('[...document.querySelectorAll("profile-tree .tree-note")].map(x => x.textContent.trim())')
            return texts.length && !texts.some(t => /Loading|読み込み/.test(t)) ? texts : null
        })
        check(!!notes, 'the Tailscale section finished loading')
        if (notes) {
            // Only the first note: on a runner it is the Tailscale status, never a machine list
            console.log(`     Tailscale section: ${notes[0]}`)
        }

        // Give a late crash a chance to show up
        await sleep(5000)
    }

    if (screenshot) {
        try {
            if (process.platform === 'darwin') {
                execFileSync('screencapture', ['-x', screenshot])
            }
            console.log(`     screenshot: ${screenshot}`)
        } catch (e) {
            console.log(`     no screenshot: ${e.message}`)
        }
    }

    check(!exited, `the app is still running${exited ? ` (exited with ${exited.code ?? exited.signal})` : ''}`)
} finally {
    ws?.close()
    if (!exited) {
        app.kill()
        await sleep(2000)
        if (!exited) {
            app.kill('SIGKILL')
        }
    }
}

const appLog = fs.readFileSync(logPath, 'utf8')
fs.closeSync(log)
fs.rmSync(configDir, { recursive: true, force: true })
// Chromium logs fatal errors as ":FATAL:"; GPU lines such as "kFatalFailure: WebGL2 blocklisted" are harmless
const errors = appLog.split('\n').filter(line => /Uncaught |:FATAL:|crashed/.test(line))
check(!errors.length, 'no fatal errors in the app log')
if (failures.length) {
    console.log('\n--- app log (last 80 lines) ---')
    console.log(appLog.split('\n').slice(-80).join('\n'))
    console.log(`\n${failures.length} check(s) failed`)
    process.exit(1)
}
console.log('\nall checks passed')
