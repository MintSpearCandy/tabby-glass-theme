/**
 * 最终截图流程: 开终端 → 截图A → 打开命令面板 (Ctrl+Shift+P) → 截图B
 * 用法: node scripts/cdpFinal.js
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9223

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
    const shot = async out => {
        const s = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'))
        console.log('SAVED:', out)
    }

    await send('Page.enable')

    // 开一个终端
    let r = await evaluate(`(() => {
        const btns = [...document.querySelectorAll('.tab-bar .btn-tab-bar')]
        let best = null, bestLen = Infinity
        for (const b of btns) {
            const svg = b.querySelector('svg')?.innerHTML ?? ''
            if (svg && svg.length < bestLen) { bestLen = svg.length; best = b }
        }
        if (best) best.click()
        return 'clicked'
    })()`)
    await sleep(2500)
    r = await evaluate(`'tabs=' + document.querySelectorAll('tab-header').length + ' xterm=' + !!document.querySelector('.xterm')`)
    console.log('AFTER OPEN:', r.result?.result?.value)

    await shot('test-env/glass-terminal.png')

    // 命令面板: Ctrl+Shift+P
    for (const type of ['rawKeyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', {
            type, modifiers: 2 | 8, key: 'p', code: 'KeyP',
            windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80,
        })
    }
    // rawKeyDown 不产生字符输入, 补一个 keyDown 形态
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown', modifiers: 2 | 8, key: 'p', code: 'KeyP',
        windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80, text: 'p',
    })
    await sleep(1200)
    r = await evaluate(`'modal=' + !!document.querySelector('.modal-content') + ' selector=' + !!document.querySelector('selector-modal, app-selector')`)
    console.log('AFTER PALETTE:', r.result?.result?.value)
    await shot('test-env/glass-palette.png')

    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
