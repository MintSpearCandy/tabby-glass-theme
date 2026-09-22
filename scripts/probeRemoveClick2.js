/**
 * 实验2: DOM 合成 mousedown 点击 .remove, 验证 Angular 删除链路
 *   (排除 CDP Input 管线不可靠的干扰; bubbles 让宿主监听器收到)
 * 用法: node scripts/probeRemoveClick2.js   (CDP_PORT 默认 9226)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9226
const CFG = 'D:/Home/Project/TabbyPlugins/WebViewer/test-env/tabby-port/data/config.yaml'

async function connectMain () {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = list.filter(t => t.type === 'page').find(t => t.url.includes('/resource'))
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
    return { ws, send }
}

async function evalIn (conn, expression) {
    const r = await conn.send('Runtime.evaluate', { returnByValue: true, expression })
    if (r.result.exceptionDetails) throw new Error('page eval failed: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 400))
    return r.result.result.value
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main () {
    const main = await connectMain()

    // 等主界面工具栏渲染完成
    for (let i = 0; i < 40; i++) {
        await sleep(500)
        if (await evalIn(main, `!!document.querySelector('.btn-tab-bar')`)) break
    }

    await evalIn(main, `(() => {
        const gear = [...document.querySelectorAll('.btn-tab-bar')].find(b => /gear/i.test(b.innerHTML))
        gear.click(); return 1
    })()`)
    for (let i = 0; i < 20; i++) {
        await sleep(500)
        if (await evalIn(main, `!!document.querySelector('settings-tab .nav-pills')`)) break
    }
    await evalIn(main, `(() => {
        const link = [...document.querySelectorAll('settings-tab .nav-pills a')].find(a => /hotkey/i.test(a.textContent))
        link.click(); return 1
    })()`)
    await sleep(1200)

    const pre = await evalIn(main, `(() => {
        const rows = [...document.querySelectorAll('multi-hotkey-input')].filter(m => m.querySelectorAll('.item').length > 0)
        if (!rows.length) return JSON.stringify({ err: 'no rows' })
        return JSON.stringify({
            rowIdx: [...document.querySelectorAll('multi-hotkey-input')].indexOf(rows[0]),
            items: rows[0].querySelectorAll('.item').length,
            hotkeysSnapshot: JSON.stringify(window.__glassConfig?._store?.hotkeys || null),
        })
    })()`)
    const p = JSON.parse(pre)
    if (p.err) throw new Error(p.err)
    console.log('BEFORE:', JSON.stringify({ rowIdx: p.rowIdx, items: p.items }))
    const cfgBefore = fs.readFileSync(CFG, 'utf8')

    const fired = await evalIn(main, `(() => {
        const remove = document.querySelectorAll('multi-hotkey-input')[${p.rowIdx}].querySelector('.item .remove')
        const log = []
        remove.addEventListener('mousedown', () => log.push('remove-mousedown'), { once: true })
        document.body.addEventListener('mousedown', () => log.push('body-mousedown'), { once: true })
        remove.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true, view: window }))
        return JSON.stringify(log)
    })()`)
    console.log('listeners fired:', fired)
    await sleep(1800)

    const post = await evalIn(main, `JSON.stringify({ items: document.querySelectorAll('multi-hotkey-input')[${p.rowIdx}].querySelectorAll('.item').length, hotkeysNow: JSON.stringify(window.__glassConfig?._store?.hotkeys || null) })`)
    const q = JSON.parse(post)
    console.log('AFTER :', JSON.stringify({ items: q.items }))
    await sleep(1500)
    const diskChanged = cfgBefore !== fs.readFileSync(CFG, 'utf8')
    const storeChanged = p.hotkeysSnapshot !== q.hotkeysNow

    console.log('RESULT: DOM删除=' + (q.items === p.items - 1) + ' | store更新=' + storeChanged + ' | yaml落盘=' + diskChanged)
    if (storeChanged) {
        const b = JSON.parse(p.hotkeysSnapshot || '{}'); const a = JSON.parse(q.hotkeysNow || '{}')
        for (const k of Object.keys(b)) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) console.log('  changed key:', k, JSON.stringify(b[k]), '->', JSON.stringify(a[k]))
    }
    main.ws.close()
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
