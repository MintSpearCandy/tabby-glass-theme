/**
 * 终端字形 3x 放大截图: node scripts/glyphShot.js <输出.png>
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9223
const OUT = process.argv[2] || 'test-env/glyph.png'

async function main () {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = targets.filter(t => t.type === 'page').find(t => t.url.includes('index'))
    if (!main) throw new Error('no main window')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evaluate = ex => send('Runtime.evaluate', { expression: ex, returnByValue: true })
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    await send('Page.enable')

    // 无终端则开一个
    let r = await evaluate(`document.querySelectorAll('tab-header').length`)
    if (parseInt(r.result?.result?.value) === 0) {
        await evaluate(`(() => { const b = [...document.querySelectorAll('.tab-bar .btn-tab-bar')]; let best = null, bl = Infinity; for (const x of b) { const s = x.querySelector('svg')?.innerHTML ?? ''; if (s && s.length < bl) { bl = s.length; best = x } } best?.click() })()`)
        await sleep(3000)
    }
    r = await evaluate(`(() => {
        const term = document.querySelector('.xterm')
        if (!term) return null
        const rect = term.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(rect.x + 10), y: Math.round(rect.y + 40), dpr: window.devicePixelRatio })
    })()`)
    const c = JSON.parse(r.result?.result?.value || 'null')
    if (!c) throw new Error('no terminal')
    console.log('dpr:', c.dpr)
    const s = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: c.x, y: c.y, width: 500, height: 110, scale: 3 },
    })
    fs.writeFileSync(OUT, Buffer.from(s.result.data, 'base64'))
    console.log('SAVED:', OUT)
    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
