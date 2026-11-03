import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BaseSession } from '../src/session.ts'
import { parseOSC7 } from '../src/middleware/oscProcessing.ts'

const logger = { debug () {}, info () {}, warn () {}, error () {}, log () {} } as any

class TestSession extends BaseSession {
    constructor () { super(logger) }
    async start (): Promise<void> { }
    resize (): void { }
    write (): void { }
    kill (): void { }
    async gracefullyKillProcess (): Promise<void> { }
    supportsWorkingDirectory (): boolean { return !!this.reportedCWD }
    async getWorkingDirectory (): Promise<string|null> { return this.reportedCWD ?? null }
    emit (data: string): void { this.emitOutput(Buffer.from(data)) }
}

describe('parseOSC7', () => {
    it('reads the host and decodes the path', () => {
        assert.deepEqual(parseOSC7('file://web1/srv/50%25 off/日本'), { host: 'web1', path: '/srv/50% off/日本' })
        assert.deepEqual(parseOSC7('file:///home/me'), { host: '', path: '/home/me' })
        assert.deepEqual(parseOSC7('file://h/a%20b'), { host: 'h', path: '/a b' })
    })

    it('keeps a path that is not valid percent-encoding as it is', () => {
        assert.deepEqual(parseOSC7('file://h/100%'), { host: 'h', path: '/100%' })
    })

    it('ignores other payloads', () => {
        assert.equal(parseOSC7('http://example.com/'), null)
        assert.equal(parseOSC7(''), null)
    })
})

describe('BaseSession and OSC 7', () => {
    it('takes the folder from the first host and hides the sequence from the terminal', async () => {
        const session = new TestSession()
        const out: string[] = []
        const reported: string[] = []
        session.binaryOutput$.subscribe(data => out.push(data.toString()))
        session.cwdReported$.subscribe(cwd => reported.push(cwd))
        session.releaseInitialDataBuffer()
        session.emit('a\x1b]7;file://web1/srv/app\x07b')
        // A shell on another machine started from this one
        session.emit('\x1b]7;file://db2/var/lib\x07')
        // Split across chunks, with the ST terminator
        session.emit('\x1b]7;file://web1/srv/')
        session.emit('app/src\x1b\\')
        assert.equal(out.join(''), 'ab')
        assert.deepEqual(reported, ['/srv/app', '/srv/app/src'])
        assert.equal(await session.getWorkingDirectory(), '/srv/app/src')
    })
})
