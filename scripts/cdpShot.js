/**
 * 隔离实例截图 + 状态探针
 * 用法: node scripts/cdpShot.js [输出.png] [--terminal]
 * 环境变量 CDP_PORT 默认 9223
 */
const PORT = process.env.CDP_PORT || 9223
const OUT = (process.argv.find(a => !a.startsWith('-') && a.endsWith('.png')) || 'test-env/glass-v1.png')
const OPEN_TERMINAL = process.argv.includes('--terminal')
const fs = require('fs')

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
        if (m.id !== undefined && pend.has(m.id)) {
            pend.get(m.id)(m)
            pend.delete(m.id)
        }
    })
    const send = (method, params = {}) => new Promise(r => {
        const i = ++id
        pend.set(i, r)
        ws.send(JSON.stringify({ id: i, method, params }))
    })
    const evaluate = ex => send('Runtime.evaluate', { expression: ex, returnByValue: true })
    const sleep = ms => new Promise(r => setTimeout(r, ms))

    // --- 状态探针 ---
    let r = await evaluate(`JSON.stringify({
        plugins: (window.pluginModules || []).map(m => m.pluginName),
        themeStyleLen: document.querySelector('style#theme')?.textContent?.length ?? 0,
        hasWallpaper: document.querySelector('style#theme')?.textContent?.includes('ac041_void') ?? false,
        tabCount: document.querySelectorAll('tab-header').length,
        innerSize: [window.innerWidth, window.innerHeight],
    })`)
    if (r.result?.result?.subtype === 'error') {
        console.log('PROBE ERROR:', r.result.result.description?.slice(0, 300))
    } else {
        console.log('STATE:', r.result?.result?.value)
    }

    // --- 打开一个终端 (点 + 按钮) ---
    if (OPEN_TERMINAL) {
        r = await evaluate(`(() => {
            const btns = [...document.querySelectorAll('.tab-bar .btn-tab-bar')]
            return JSON.stringify(btns.map((b, i) => {
                const rect = b.getBoundingClientRect()
                return { i, x: Math.round(rect.x), w: Math.round(rect.width),
                         svg: (b.querySelector('svg')?.innerHTML || '').slice(0, 50) }
            }))
        })()`)
        console.log('TOOLBAR BUTTONS:', r.result?.result?.value)
        // + 按钮的 svg 是两条线段 (path 数量少且短); 点 svg 最简单的那个
        r = await evaluate(`(() => {
            const btns = [...document.querySelectorAll('.tab-bar .btn-tab-bar')]
            let best = null, bestLen = Infinity
            for (const b of btns) {
                const svg = b.querySelector('svg')?.innerHTML ?? ''
                if (svg && svg.length < bestLen) { bestLen = svg.length; best = b }
            }
            if (!best) return 'no button'
            best.click()
            return 'clicked, svg=' + bestLen
        })()`)
        console.log('CLICK:', r.result?.result?.value)
        await sleep(2500)  // 等 PTY 启动 + 终端渲染
        r = await evaluate(`document.querySelectorAll('tab-header').length + ' tabs, terminal: ' + !!document.querySelector('.xterm')`)
        console.log('AFTER:', r.result?.result?.value)
    }

    // --- 截图 ---
    await send('Page.enable')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
    console.log('SAVED:', OUT)
    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
