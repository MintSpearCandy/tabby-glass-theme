/** 验证设置页改版: 默认壁纸回退 / 布局渲染 / 截图. 用法: node scripts/probeSettingsRedesign.js [CDP_PORT=9240] */
const fs = require('fs')
const PORT = process.argv[2] || process.env.CDP_PORT || 9240

async function main () {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = list.filter(t => t.type === 'page').find(t => t.url.includes('/resource') || t.url.includes('index'))
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evl = async ex => {
        const r = await send('Runtime.evaluate', { returnByValue: true, expression: ex })
        if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || '').slice(0, 200))
        return r.result.result.value
    }
    for (let i = 0; i < 25; i++) { await new Promise(r => setTimeout(r, 1000)); if (await evl('!!window.__glassConfig')) break }

    const s = JSON.parse(await evl(`(() => {
        const vars = document.querySelector('style#glass-vars')
        return JSON.stringify({
            theme: window.__glassConfig.store.appearance.theme,
            cssLen: document.getElementById('theme').textContent.length,
            varsText: vars ? vars.textContent.slice(0, 160) : '(none)',
            defaultWp: window.__glassDefaultWallpaper ? window.__glassDefaultWallpaper() : 'MISSING',
            locked: document.documentElement.classList.contains('glass-locked'),
        })
    })()`))
    console.log('STATE:', JSON.stringify(s, null, 1))

    await evl(`[...document.querySelectorAll('.btn-tab-bar')].find(b=>/gear/i.test(b.innerHTML)).click();1`)
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (await evl(`!!document.querySelector('settings-tab .nav-pills')`)) break }
    await evl(`(()=>{const l=[...document.querySelectorAll('settings-tab .nav-pills a')].find(a=>/glass/i.test(a.textContent));if(l)l.click();return 1})()`)
    await new Promise(r => setTimeout(r, 1500))

    const ui = JSON.parse(await evl(`(() => {
        const box = document.querySelector('.glass-settings')
        return JSON.stringify({
            formLines: box ? box.querySelectorAll('.form-line').length : 0,
            titles: box ? [...box.querySelectorAll('.header .title')].map(t => t.textContent.trim()) : [],
            descriptions: box ? [...box.querySelectorAll('.header .description')].map(t => t.textContent.trim().slice(0, 30)) : [],
            placeholder: (box?.querySelector('input[type=text]') || {}).placeholder || '',
            inlineSwitch: !!box?.querySelector('.glass-settings-inline-switch'),
        })
    })()`))
    console.log('UI:', JSON.stringify(ui, null, 1))

    await send('Page.enable')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync('test-env/glass-settings-redesign.png', Buffer.from(shot.result.data, 'base64'))
    console.log('screenshot: test-env/glass-settings-redesign.png')
    ws.close()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
