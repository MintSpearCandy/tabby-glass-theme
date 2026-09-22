/**
 * 壁纸深度调试二段: 通路验证 + 启动异常抓取
 * node scripts/deepDebugWallpaper.js
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9223

async function main () {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = targets.filter(t => t.type === 'page').find(t => t.url.includes('index'))
    if (!main) throw new Error('no main window')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    const consoleMsgs = []
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
        if (m.method === 'Runtime.consoleAPICalled') {
            const args = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
            consoleMsgs.push(`[${m.params.type}] ${args}`.slice(0, 300))
        }
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails
            consoleMsgs.push(`[EXCEPTION] ${(d.text + ' ' + (d.exception?.description || '')).slice(0, 400)}`)
        }
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evaluate = ex => send('Runtime.evaluate', { expression: ex, returnByValue: true })
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    await send('Page.enable')
    await send('Runtime.enable')

    // 1. 手动注入 CSS 变量 → 验证变量→::before 渲染通路
    await evaluate(`document.documentElement.style.setProperty('--glass-wallpaper-image', 'url("file:///D:/App/Tabby/resources/ac041_void棺材胡桃4k.jpg")')`)
    await sleep(300)
    let r = await evaluate(`getComputedStyle(document.querySelector('app-root'), '::before').backgroundImage.slice(0, 80)`)
    console.log('[通路] 手动注入后 ::before:', r.result?.result?.value)

    // 2. 清掉手动注入, reload 抓启动期异常
    await evaluate(`document.documentElement.style.removeProperty('--glass-wallpaper-image')`)
    await send('Page.reload')
    await sleep(9000)  // 等完整引导 + config ready

    r = await evaluate(`JSON.stringify({
        varImage: document.documentElement.style.getPropertyValue('--glass-wallpaper-image').slice(0, 60),
        bgImage: getComputedStyle(document.querySelector('app-root'), '::before').backgroundImage.slice(0, 60),
    })`)
    console.log('[reload 后]', r.result?.result?.value)
    console.log('[启动期 console/异常]')
    consoleMsgs.filter(m => /glass|error|exception|fail/i.test(m)).slice(0, 10).forEach(m => console.log('  ', m))
    if (consoleMsgs.length === 0) console.log('   (无)')

    const s = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync('test-env/wallpaper-debug.png', Buffer.from(s.result.data, 'base64'))
    console.log('SAVED: test-env/wallpaper-debug.png')
    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
