/**
 * 实验4: hook addEventListener, 观察 multiHotkeyInput 渲染时 mousedown 注册到哪个元素;
 *        dispatch 后检查触发与异常。判定 Angular listener 存在性。
 * 用法: node scripts/probeRemoveClick4.js   (CDP_PORT 默认 9227)
 */
const PORT = process.env.CDP_PORT || 9227

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
    const events = []
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
        if (m.method === 'Runtime.exceptionThrown') events.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 300))
        if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) events.push(m.params.type.toUpperCase() + ': ' + (m.params.args.map(a => a.value || a.description || '').join(' ')).slice(0, 300))
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    return { ws, send, events }
}

async function evalIn (conn, expression) {
    const r = await conn.send('Runtime.evaluate', { returnByValue: true, expression })
    if (r.result.exceptionDetails) throw new Error('page eval failed: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 400))
    return r.result.result.value
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main () {
    const conn = await connectMain()
    await conn.send('Runtime.enable')

    for (let i = 0; i < 40; i++) {
        await sleep(500)
        if (await evalIn(conn, `!!document.querySelector('.btn-tab-bar')`)) break
    }

    // 注入 hook (先于设置页渲染)
    await evalIn(conn, `(() => {
        window.__hookLog = []
        const orig = EventTarget.prototype.addEventListener
        EventTarget.prototype.addEventListener = function (type, ...rest) {
            try {
                const el = this
                const cls = (el.className || '').toString().slice(0, 40)
                const tag = el.tagName || (el === document ? '#document' : el === window ? '#window' : '?')
                window.__hookLog.push(type + ' @ ' + tag + (cls ? '.' + cls : ''))
            } catch {}
            return orig.call(this, type, ...rest)
        }
        return 'hook installed'
    })()`)

    // 打开设置 → Hotkeys
    await evalIn(conn, `(() => { [...document.querySelectorAll('.btn-tab-bar')].find(b => /gear/i.test(b.innerHTML)).click(); return 1 })()`)
    for (let i = 0; i < 20; i++) {
        await sleep(500)
        if (await evalIn(conn, `!!document.querySelector('settings-tab .nav-pills')`)) break
    }
    await evalIn(conn, `(() => { [...document.querySelectorAll('settings-tab .nav-pills a')].find(a => /hotkey/i.test(a.textContent)).click(); return 1 })()`)
    await sleep(1200)

    // 渲染期间的 mousedown 注册记录
    const regs = await evalIn(conn, `JSON.stringify(window.__hookLog.filter(x => x.startsWith('mousedown')).slice(0, 40))`)
    console.log('mousedown registrations during settings render:', regs)

    // 快照 + 合成 dispatch
    const pre = JSON.parse(await evalIn(conn, `(() => {
        const rows = [...document.querySelectorAll('multi-hotkey-input')].filter(m => m.querySelectorAll('.item').length > 0)
        if (!rows.length) return JSON.stringify({ err: 'no rows' })
        return JSON.stringify({ rowIdx: [...document.querySelectorAll('multi-hotkey-input')].indexOf(rows[0]), items: rows[0].querySelectorAll('.item').length, snap: JSON.stringify(window.__glassConfig?._store?.hotkeys) })
    })()`))
    if (pre.err) throw new Error(pre.err)
    console.log('BEFORE:', JSON.stringify({ rowIdx: pre.rowIdx, items: pre.items }))
    conn.events.length = 0

    await evalIn(conn, `document.querySelectorAll('multi-hotkey-input')[${pre.rowIdx}].querySelector('.item .remove').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,cancelable:true}))`)
    await sleep(1800)

    const post = JSON.parse(await evalIn(conn, `JSON.stringify({ items: document.querySelectorAll('multi-hotkey-input')[${pre.rowIdx}].querySelectorAll('.item').length, snap: JSON.stringify(window.__glassConfig?._store?.hotkeys) })`))
    console.log('AFTER :', JSON.stringify({ items: post.items }))
    console.log('store changed:', pre.snap !== post.snap)
    console.log('page errors during dispatch:', conn.events.length ? conn.events : '(none)')
    conn.ws.close()
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
