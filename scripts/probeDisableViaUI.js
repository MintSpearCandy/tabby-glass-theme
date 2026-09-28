/**
 * 用户真实路径复现: 设置页开着 → UI 开关开启 → UI 开关关闭 → 交互可控性检测
 * 可控性 = elementFromPoint 在多个位置命中的元素是否可见/可交互 + 覆盖层检测
 * 用法: node scripts/probeDisableViaUI.js   (CDP_PORT 默认 9260)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9260

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
        if (m.method === 'Runtime.consoleAPICalled') {
            events.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200))
        }
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

    // 打开设置页 → 切到 Glass 页 (用户操作路径)
    await evl(`[...document.querySelectorAll('.btn-tab-bar')].find(b=>/gear/i.test(b.innerHTML)).click();1`)
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (await evl(`!!document.querySelector('settings-tab .nav-pills')`)) break }
    await evl(`(() => { const l=[...document.querySelectorAll('settings-tab .nav-pills a')].find(a=>/glass/i.test(a.textContent)); if(l)l.click(); return 1 })()`)
    await new Promise(r => setTimeout(r, 1500))
    // 先开开关 (若未开)
    const enabled = await evl(`window.__glassConfig._store.glass?.themeEnabled !== false`)
    if (!enabled) {
        await evl(`(() => { const sw=document.querySelector('#glassThemeEnabled'); if(sw){sw.click()} return 1 })()`)
        await new Promise(r => setTimeout(r, 2500))
    }
    console.log('开启态: cssLen', await evl(`document.getElementById('theme').textContent.length`), '| glass页:', await evl(`!!document.querySelector('.glass-settings')`))

    // 用户路径: 点击 UI 开关关闭 (不是 console 直调!)
    const clickResult = await evl(`(() => { const sw=document.querySelector('#glassThemeEnabled'); if(!sw) return 'SWITCH NOT FOUND'; sw.click(); return 'clicked' })()`)
    console.log('开关点击:', clickResult)
    await new Promise(r => setTimeout(r, 3500))

    const off = JSON.parse(await evl(`(() => {
        // 可控性检测: 视口网格采样, elementFromPoint 命中的元素是否被透明层挡住
        const hits = []
        for (const [fx, fy] of [[0.5, 0.06], [0.5, 0.3], [0.5, 0.6], [0.5, 0.9], [0.1, 0.5], [0.9, 0.5]]) {
            const x = Math.round(innerWidth * fx), y = Math.round(innerHeight * fy)
            const el = document.elementFromPoint(x, y)
            if (!el) { hits.push([fx, fy, 'null']); continue }
            const cs = getComputedStyle(el)
            hits.push([fx, fy, (el.tagName + '.' + (el.className || '').toString().slice(0, 25)).slice(0, 40), 'pe:' + cs.pointerEvents, 'op:' + cs.opacity])
        }
        return JSON.stringify({
            cssLen: document.getElementById('theme').textContent.length,
            theme: window.__glassConfig.store.appearance.theme,
            settingsOpen: !!document.querySelector('settings-tab'),
            glassSettingsBox: !!document.querySelector('.glass-settings'),
            hitSample: hits,
        })
    })()`))
    console.log('关闭后:', JSON.stringify(off, null, 1))
    await send('Page.enable')
    fs.writeFileSync('test-env/ui-disable-off.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
    console.log('console errors:', events.length ? events.join('\n') : '(none)')
    ws.close()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
