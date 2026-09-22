/**
 * 实验5 前半: 打开设置 Hotkeys 页, bringToFront, 输出 .remove 的屏幕物理坐标 JSON
 * 用法: node scripts/probeOsClick.js coords   (CDP_PORT 默认 9228)
 *       node scripts/probeOsClick.js verify
 */
const PORT = process.env.CDP_PORT || 9228

async function connectMain () {
    let list
    for (let i = 0; i < 15; i++) {
        try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break } catch { await new Promise(r => setTimeout(r, 2000)) }
    }
    if (!list) throw new Error('/json/list unreachable')
    const main = list.filter(t => t.type === 'page').find(t => t.url.includes('/resource'))
    if (!main) throw new Error('no main window')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    return { ws, send }
}
async function evalIn (conn, expression) {
    const r = await conn.send('Runtime.evaluate', { returnByValue: true, expression })
    if (r.result.exceptionDetails) throw new Error('page eval failed: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300))
    return r.result.result.value
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main () {
    const mode = process.argv[2] || 'coords'
    const conn = await connectMain()

    if (mode === 'coords') {
        for (let i = 0; i < 40; i++) { await sleep(500); if (await evalIn(conn, `!!document.querySelector('.btn-tab-bar')`)) break }
        await evalIn(conn, `(() => { [...document.querySelectorAll('.btn-tab-bar')].find(b => /gear/i.test(b.innerHTML)).click(); return 1 })()`)
        for (let i = 0; i < 20; i++) { await sleep(500); if (await evalIn(conn, `!!document.querySelector('settings-tab .nav-pills')`)) break }
        await evalIn(conn, `(() => { [...document.querySelectorAll('settings-tab .nav-pills a')].find(a => /hotkey/i.test(a.textContent)).click(); return 1 })()`)
        await sleep(1200)
        await conn.send('Page.enable')
        await conn.send('Page.bringToFront')
        await sleep(800)
        const c = await evalIn(conn, `(() => {
            const rows = [...document.querySelectorAll('multi-hotkey-input')].filter(m => m.querySelectorAll('.item').length > 0)
            if (!rows.length) return JSON.stringify({ err: 'no rows' })
            const r = rows[0].querySelector('.item .remove').getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            const hBorder = (window.outerWidth - window.innerWidth) / 2
            const vChrome = window.outerHeight - window.innerHeight - hBorder
            return JSON.stringify({
                cssX: r.x + r.width / 2, cssY: r.y + r.height / 2,
                screenDipX: window.screenX + hBorder + r.x + r.width / 2,
                screenDipY: window.screenY + vChrome + r.y + r.height / 2,
                dpr,
                physX: Math.round((window.screenX + hBorder + r.x + r.width / 2) * dpr),
                physY: Math.round((window.screenY + vChrome + r.y + r.height / 2) * dpr),
                items: rows[0].querySelectorAll('.item').length,
            })
        })()`)
        console.log(c)
    } else {
        const items = await evalIn(conn, `document.querySelectorAll('multi-hotkey-input')[0].querySelectorAll('.item').length`)
        const store = await evalIn(conn, `JSON.stringify(window.__glassConfig?._store?.hotkeys)`)
        console.log(JSON.stringify({ items, storeLen: store.length, storeHead: store.slice(0, 200) }))
    }
    conn.ws.close()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
