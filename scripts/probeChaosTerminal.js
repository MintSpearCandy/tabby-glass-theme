/**
 * 带终端 tab 的关闭混乱复现: 开终端 → 开启态采样 → 关闭 → 终端区域采样对比
 * 用法: node scripts/probeChaosTerminal.js   (CDP_PORT 默认 9244)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9244

async function main () {
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
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200))
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evl = async ex => {
        const r = await send('Runtime.evaluate', { returnByValue: true, expression: ex })
        if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || '').slice(0, 250))
        return r.result.result.value
    }
    await send('Runtime.enable')
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); if (await evl('!!window.__glassConfig')) break }
    await new Promise(r => setTimeout(r, 1500))

    // 开一个终端 tab (点 tab-bar 的 + 按钮)
    await evl(`(() => { const b=[...document.querySelectorAll('.btn-tab-bar')].find(x=>/plus/i.test(x.innerHTML)); if(b)b.click(); return !!b })()`)
    await new Promise(r => setTimeout(r, 4000))

    const sample = async () => JSON.parse(await evl(`(() => {
        const info = sel => { const el = document.querySelector(sel); if (!el) { return null } ; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { bg: cs.backgroundColor, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], z: cs.zIndex, opacity: cs.opacity } }
        const canvas = document.querySelector('.xterm-screen canvas, .terminal xterm canvas')
        return JSON.stringify({
            cssLen: document.getElementById('theme')?.textContent.length,
            appRoot: info('app-root'),
            appRootBeforeBg: (() => { const cs = getComputedStyle(document.querySelector('app-root'), '::before'); return (cs.backgroundImage || '').slice(0, 60) + '/' + cs.opacity })(),
            terminalTab: info('terminal-tab'),
            termHolder: info('terminal-tab .content'),
            xterm: info('.xterm'),
            xtermViewportBg: (() => { const el = document.querySelector('.xterm-viewport'); return el ? getComputedStyle(el).backgroundColor : null })(),
            xtermHelper: info('.xterm-helpers'),
            tabBody: info('tab-body'),
        })
    })()`))

    console.log('== 开启态(带终端) ==')
    const on = await sample()
    console.log(JSON.stringify(on, null, 1))
    await send('Page.enable')
    fs.writeFileSync('test-env/chaos-term-on.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

    console.log('== 关闭开关 ==')
    await evl('window.__glassSetTheme(false); 1')
    await new Promise(r => setTimeout(r, 3500))
    const off = await sample()
    console.log(JSON.stringify(off, null, 1))
    fs.writeFileSync('test-env/chaos-term-off.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

    console.log('== 差异 ==')
    for (const k of Object.keys(on)) if (JSON.stringify(on[k]) !== JSON.stringify(off[k])) console.log(k, ':', JSON.stringify(on[k]), '→', JSON.stringify(off[k]))
    console.log('errors:', events.length ? events.join('\n') : '(none)')
    ws.close()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
