// Renders the SVG sources into the PNG/ICNS files the app and installers use.
// Run with: xvfb-run electron build/tsugite/render-icons.cjs  (from the repo root)
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const src = name => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, name)).toString('base64')

const jobs = [
    ...[16, 32, 64, 128, 256, 512].map(s => ['icon.svg', s, `build/icons/${s}x${s}.png`]),
    ['icon.svg', 1024, 'build/icons/Icon-MacOS-512x512@2x.png'],
    ['icon.svg', 32, 'app/assets/tray.png'],
    ['template.svg', 16, 'app/assets/tray-darwinTemplate.png'],
    ['template.svg', 32, 'app/assets/tray-darwinTemplate@2x.png'],
    ['template.svg', 16, 'app/assets/tray-darwinHighlightTemplate.png'],
    ['template.svg', 32, 'app/assets/tray-darwinHighlightTemplate@2x.png'],
]
// ICNS entries that hold PNG data, by pixel size
const icnsTypes = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await win.loadURL('about:blank')
    const render = (svg, size) => win.webContents.executeJavaScript(`new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
            const c = document.createElement('canvas')
            c.width = c.height = ${size}
            c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size})
            resolve(c.toDataURL('image/png').split(',')[1])
        }
        img.src = '${src(svg)}'
    })`).then(b64 => Buffer.from(b64, 'base64'))

    for (const [svg, size, out] of jobs) {
        fs.writeFileSync(path.join(root, out), await render(svg, size))
    }

    const chunks = []
    for (const [type, size] of icnsTypes) {
        const png = await render('icon.svg', size)
        const header = Buffer.alloc(8)
        header.write(type, 0, 'ascii')
        header.writeUInt32BE(png.length + 8, 4)
        chunks.push(header, png)
    }
    const body = Buffer.concat(chunks)
    const header = Buffer.alloc(8)
    header.write('icns', 0, 'ascii')
    header.writeUInt32BE(body.length + 8, 4)
    fs.writeFileSync(path.join(root, 'build/mac/icon.icns'), Buffer.concat([header, body]))

    fs.copyFileSync(path.join(__dirname, 'joint.svg'), path.join(root, 'app/assets/logo.svg'))
    fs.copyFileSync(path.join(__dirname, 'icon.svg'), path.join(root, 'build/icons/icon.svg'))
    app.quit()
})
