/**
 * 决定性实验: 真实 mousedown 点击快捷键键位的 × 删除按钮, 验证完整链路:
 *   DOM 键位消失 → config.store.hotkeys 更新 → config.yaml 落盘
 * 用法: node scripts/probeRemoveClick.js   (CDP_PORT 默认 9225)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9225
const CFG = 'D:/Home/Project/TabbyPlugins/WebViewer/test-env/tabby-port/data/config.yaml'

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
    await main.send('Page.enable')
    await main.send('Page.bringToFront')
    await sleep(1500)

    // 等主界面工具栏渲染完成
    for (let i = 0; i < 40; i++) {
        await sleep(500)
        if (await evalIn(main, `!!document.querySelector('.btn-tab-bar')`)) break
    }

    // 打开设置 → Hotkeys
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

    // 找一个有多个键位的行, 快照前后状态
    const before = await evalIn(main, `(() => {
        const rows = [...document.querySelectorAll('multi-hotkey-input')].filter(m => m.querySelectorAll('.item').length > 0)
        if (!rows.length) return JSON.stringify({ err: 'no rows with hotkeys' })
        const row = rows[0]
        const remove = row.querySelector('.item .remove')
        const r = remove.getBoundingClientRect()
        return JSON.stringify({
            rowIdx: [...document.querySelectorAll('multi-hotkey-input')].indexOf(row),
            items: row.querySelectorAll('.item').length,
            center: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
            hotkeysSnapshot: JSON.stringify(window.__glassConfig?._store?.hotkeys || null),
        })
    })()`)
    const pre = JSON.parse(before)
    if (pre.err) throw new Error(pre.err)
    console.log('BEFORE:', JSON.stringify({ rowIdx: pre.rowIdx, items: pre.items, center: pre.center }))
    const cfgBefore = fs.readFileSync(CFG, 'utf8')

    // 真实 mousedown/mouseup (走 Chromium 输入管线, Angular (mousedown) 必触发)
    await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pre.center.x, y: pre.center.y, button: 'left', clickCount: 1 })
    await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pre.center.x, y: pre.center.y, button: 'left', clickCount: 1 })
    console.log('mousedown dispatched at', Math.round(pre.center.x), Math.round(pre.center.y))
    await sleep(1800)

    const after = await evalIn(main, `(() => {
        const row = document.querySelectorAll('multi-hotkey-input')[${pre.rowIdx}]
        return JSON.stringify({
            items: row.querySelectorAll('.item').length,
            hotkeysNow: JSON.stringify(window.__glassConfig?._store?.hotkeys || null),
        })
    })()`)
    const post = JSON.parse(after)
    console.log('AFTER :', JSON.stringify({ items: post.items }))

    await sleep(1500)
    const cfgAfter = fs.readFileSync(CFG, 'utf8')

    const domDeleted = post.items === pre.items - 1
    const storeChanged = pre.hotkeysSnapshot !== post.hotkeysNow
    const diskChanged = cfgBefore !== cfgAfter
    console.log('RESULT: DOM删除=' + domDeleted + ' | store更新=' + storeChanged + ' | yaml落盘=' + diskChanged)
    if (!diskChanged && storeChanged) {
        const b = JSON.parse(pre.hotkeysSnapshot || '{}'); const a = JSON.parse(post.hotkeysNow || '{}')
        for (const k of Object.keys(b)) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) console.log('  changed key:', k, JSON.stringify(b[k]), '->', JSON.stringify(a[k]))
    }
    main.ws.close()
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
