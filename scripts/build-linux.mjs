#!/usr/bin/env node
import { build as builder } from 'electron-builder'
import * as vars from './vars.mjs'

process.env.ARCH = process.env.ARCH || process.arch

builder({
    dir: true,
    linux: ['deb', 'tar.gz'],
    arm64: process.env.ARCH === 'arm64',
    config: {
        npmRebuild: false,
        extraMetadata: {
            version: vars.version,
        },
    },
    publish: 'never',
}).catch(e => {
    console.error(e)
    process.exit(1)
})
