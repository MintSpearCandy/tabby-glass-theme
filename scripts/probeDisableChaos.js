/**
 * 复现并定位: 总开关关闭后的"界面元素混乱"
 * 流程: 启动(首启接管=Glass) → 截图 → 关闭开关 → 截图 + 关键元素 computed 采样对比
 * 用法: node scripts/probeDisableChaos.js   (CDP_PORT 默认 9243)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9243

async function connect () {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = list.filter(t => t.type === 'page').find(t => t.url.includes('/resource') || t.url.includes('index'))
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    const events = []
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
        if (m.method === 'Runtime.consoleAPICalled') {
            const txt = m.params.args.map(a => a.value || a.description || '').join(' ')
            if (txt.includes('glass') || m.params.type === 'error') events.push(txt.slice(0, 160))
        }
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evl = async ex => {
        const r = await send('Runtime.evaluate', { returnByValue: true, expression: ex })
        if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || '').slice(0, 250))
        return r.result.result.value
    }
    return { ws, send, evl, events }
}

const sampleExpr = `(() => {
    const probe = sel => { const el = document.querySelector(sel); if (!el) { return null } ;const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { display: cs.display, pos: cs.position, bg: cs.backgroundColor.slice(0, 40), color: cs.color, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] } }
    return JSON.stringify({
        themeCssLen: document.getElementById('theme')?.textContent.length,
        lockedClass: document.documentElement.classList.contains('glass-locked'),
        glassVarsLen: document.querySelector('style#glass-vars')?.textContent.length ?? -1,
        rootInlineStyleLen: document.documentElement.style.cssText.length,
        tabBar: probe('.tab-bar'),
        tabBarTabs: probe('.tab-bar .tabs'),
        firstHeader: probe('tab-header'),
        mainContent: probe('.main.content'),
        terminal: probe('terminal-tab .content, .term'),
        titleBar: probe('title-bar'),
        windowEl: probe('.window'),
    })
})()`

async function main () {
    const conn = await connect()
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); if (await conn.evl('!!window.__glassConfig')) break }
    await new Promise(r => setTimeout(r, 1500))

    console.log('== 开启态采样 ==')
    const on = JSON.parse(await conn.evl(sampleExpr))
    console.log(JSON.stringify(on, null, 1))
    await conn.send('Page.enable')
    fs.writeFileSync('test-env/chaos-on.png', Buffer.from((await conn.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

    console.log('\n== 关闭开关 ==')
    await conn.evl('window.__glassSetTheme(false); 1')
    await new Promise(r => setTimeout(r, 3000))
    const off = JSON.parse(await conn.evl(sampleExpr))
    console.log(JSON.stringify(off, null, 1))
    fs.writeFileSync('test-env/chaos-off.png', Buffer.from((await conn.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

    console.log('\n== 差异摘要 ==')
    for (const k of Object.keys(on)) {
        if (JSON.stringify(on[k]) !== JSON.stringify(off[k])) {
            console.log(k + ':', JSON.stringify(on[k]), '→', JSON.stringify(off[k]))
        }
    }
    console.log('\nconsole events:', conn.events.length ? conn.events.join('\n') : '(none)')
    conn.ws.close()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
