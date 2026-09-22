/**
 * 一键验证设置页三处修复 (设置是主窗口内的 settings-tab, 非独立窗口):
 *   1. multi-hotkey-input .remove 热区 (padding 恢复 → rect 含 8px 左右内边)
 *   2. select option 弹层底色 (#0a0c10 不透明)
 *   3. .btn i+* / .list-group-item i+* 图标间距 (5px / 10px)
 * 环境变量 CDP_PORT 默认 9225
 */
const PORT = process.env.CDP_PORT || 9225

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

    // 打开设置 tab (gear 按钮)
    await evalIn(main, `(() => {
        const btns = [...document.querySelectorAll('.btn-tab-bar')]
        const gear = btns.find(b => /gear/i.test(b.innerHTML))
        if (!gear) throw new Error('gear button not found')
        gear.click()
        return 1
    })()`)

    // 等 settings-tab 渲染
    let ok = false
    for (let i = 0; i < 20; i++) {
        await sleep(500)
        ok = await evalIn(main, `!!document.querySelector('settings-tab .nav-pills')`)
        if (ok) break
    }
    if (!ok) throw new Error('settings-tab did not render')
    console.log('settings-tab rendered')

    // ---- Application 页 (默认): 图标间距 / option 底色 / checkbox 边框 ----
    const app = await evalIn(main, `(() => {
        const btnI = document.querySelector('.btn i + *')
        const lgI = document.querySelector('.list-group-item i + *')
        const opt = document.querySelector('select option')
        const chk = document.querySelector('.form-check-input')
        return JSON.stringify({
            btnI_marginLeft: btnI ? getComputedStyle(btnI).marginLeft : 'n/a',
            lgI_marginLeft: lgI ? getComputedStyle(lgI).marginLeft : 'n/a',
            option_bg: opt ? getComputedStyle(opt).backgroundColor : 'n/a',
            option_color: opt ? getComputedStyle(opt).color : 'n/a',
            checkbox_border: chk ? getComputedStyle(chk).borderColor : 'n/a',
            checkbox_bg_var: chk ? getComputedStyle(chk).getPropertyValue('--bs-form-check-bg').trim() : 'n/a',
        })
    })()`)
    console.log('APPLICATION PAGE:', app)

    // ---- 切到 Hotkeys 页 ----
    await evalIn(main, `(() => {
        const link = [...document.querySelectorAll('settings-tab .nav-pills a')].find(a => /hotkey/i.test(a.textContent))
        if (!link) throw new Error('hotkeys nav not found')
        link.click()
        return 1
    })()`)
    await sleep(1200)

    const hk = await evalIn(main, `(() => {
        const removes = [...document.querySelectorAll('multi-hotkey-input .item .remove')]
        const bodies = [...document.querySelectorAll('multi-hotkey-input .item .body')]
        const items = [...document.querySelectorAll('multi-hotkey-input .item')]
        const fmt = el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
        let hit = 'no .remove in DOM'
        if (removes.length) {
            const r = removes[0].getBoundingClientRect()
            const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            hit = el ? ('' + el.className) : 'null'
        }
        return JSON.stringify({ itemCount: items.length, removeRect: removes.map(fmt)[0] || null, bodyRect: bodies.map(fmt)[0] || null, hitTestAtRemoveCenter: hit })
    })()`)
    console.log('HOTKEYS PAGE:', hk)

    // 截图存档
    await main.send('Page.enable')
    await main.send('Page.captureScreenshot', { format: 'png' }).then(r => {
        require('fs').writeFileSync('test-env/glass-settings-fix-verify.png', Buffer.from(r.result.data, 'base64'))
    }).catch(e => console.error('screenshot failed:', e.message))
    console.log('DONE')
    main.ws.close()
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
