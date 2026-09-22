/**
 * 实验3: 定位 Angular 绑定失效范围 + 收集页面异常
 *   a) .body mousedown → 编辑弹窗?
 *   b) .add click → 添加弹窗?
 *   c) 搜索框 input → 列表过滤?
 *   d) 全程收集 console 错误 / exceptionThrown
 * 用法: node scripts/probeRemoveClick3.js   (CDP_PORT 默认 9226)
 */
const PORT = process.env.CDP_PORT || 9226

async function connectMain () {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
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
        if (m.method === 'Runtime.exceptionThrown') events.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 260))
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push('CERR: ' + (m.params.args.map(a => a.value || a.description || '').join(' ')).slice(0, 260))
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
    const main = await connectMain()
    await main.send('Runtime.enable')

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

    // 快照行数
    const preRows = await evalIn(main, `[...document.querySelectorAll('multi-hotkey-input')].length`)
    console.log('rows:', preRows)

    // a) .body mousedown → 编辑弹窗?
    await evalIn(main, `document.querySelectorAll('multi-hotkey-input')[0].querySelector('.item .body').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,cancelable:true}))`)
    await sleep(900)
    const modalA = await evalIn(main, `!!document.querySelector('hotkey-input-modal, .modal-dialog')`)
    console.log('a) .body mousedown → modal:', modalA)
    // 关掉弹窗 (Escape)
    await evalIn(main, `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1`)
    await sleep(600)
    // 若 modal 还在, 移除之
    await evalIn(main, `(() => { const m=document.querySelector('.modal'); if(m) m.remove(); return 1 })()`)

    // b) .add click → 弹窗?
    await evalIn(main, `document.querySelectorAll('multi-hotkey-input')[0].querySelector('.add').dispatchEvent(new MouseEvent('click',{button:0,bubbles:true,cancelable:true}))`)
    await sleep(900)
    const modalB = await evalIn(main, `!!document.querySelector('hotkey-input-modal, .modal-dialog')`)
    console.log('b) .add click → modal:', modalB)
    await evalIn(main, `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1`)
    await sleep(600)
    await evalIn(main, `(() => { const m=document.querySelector('.modal'); if(m) m.remove(); return 1 })()`)

    // c) 搜索框过滤
    const preVisible = await evalIn(main, `document.querySelectorAll('hotkey-settings-tab .row').length`)
    await evalIn(main, `(() => {
        const inp = document.querySelector('hotkey-settings-tab input[type=search]')
        inp.value = 'zzzz-no-match'
        inp.dispatchEvent(new Event('input',{bubbles:true}))
        return 1
    })()`)
    await sleep(900)
    const postVisible = await evalIn(main, `document.querySelectorAll('hotkey-settings-tab .row').length`)
    console.log('c) 搜索过滤 rows:', preVisible, '->', postVisible)

    console.log('page errors during test:', main.events.length ? main.events : '(none)')
    main.ws.close()
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
