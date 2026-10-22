#!/usr/bin/env node
import { build as builder } from 'electron-builder'
import * as vars from './vars.mjs'

process.env.ARCH = process.env.ARCH || process.arch
// No Apple Developer ID: skip signing instead of picking up a random keychain identity
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

builder({
    dir: true,
    mac: ['dmg', 'zip'],
    x64: process.env.ARCH === 'x86_64' || process.env.ARCH === 'x64',
    arm64: process.env.ARCH === 'arm64',
    config: {
        extraMetadata: {
            version: vars.version,
        },
        npmRebuild: process.env.ARCH !== 'arm64',
    },
    publish: 'never',
}).catch(e => {
    console.error(e)
    process.exit(1)
})
