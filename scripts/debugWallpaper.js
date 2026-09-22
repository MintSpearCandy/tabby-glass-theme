/**
 * 壁纸渲染深度调试: node scripts/debugWallpaper.js
 * 检查链条: config 值 → CSS 变量 → ::before computed background → 图片可加载性
 */
const PORT = process.env.CDP_PORT || 9223

async function main () {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = targets.filter(t => t.type === 'page').find(t => t.url.includes('index'))
    if (!main) throw new Error('no main window')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    })
    const evaluate = ex => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true } })) })
    const sleep = ms => new Promise(r => setTimeout(r, ms))

    await sleep(6000)  // 等引导 + config ready + applyGlassVars

    // 1. 配置层
    let r = await evaluate(`(() => {
        const cs = document.documentElement.style
        return JSON.stringify({
            cssVarImage: cs.getPropertyValue('--glass-wallpaper-image'),
            cssVarOpacity: cs.getPropertyValue('--glass-wallpaper-opacity'),
        })
    })()`)
    console.log('[1] CSS 变量:', r.result?.result?.value)

    // 2. computed 层: ::before 实际解析出的背景
    r = await evaluate(`(() => {
        const cs = getComputedStyle(document.querySelector('app-root'), '::before')
        return JSON.stringify({
            bgImage: (cs.backgroundImage || '').slice(0, 140),
            opacity: cs.opacity,
        })
    })()`)
    console.log('[2] ::before computed:', r.result?.result?.value)

    // 3. 图片可加载性 (与 CSS 同源上下文)
    r = await evaluate(`(() => new Promise(resolve => {
        const img = new Image()
        img.onload = () => resolve('可加载: ' + img.naturalWidth + 'x' + img.naturalHeight)
        img.onerror = () => resolve('加载失败')
        img.src = 'file:///D:/App/Tabby/resources/ac041_void棺材胡桃4k.jpg'
        setTimeout(() => resolve('超时'), 3000)
    }))()`)
    console.log('[3] 图片加载测试:', r.result?.result?.value)

    // 4. 壁纸元素实际渲染像素 (采样 app-root::before 中心, 通过截图 clip 1x1 太麻烦 — 用元素可见性判断)
    r = await evaluate(`(() => {
        const root = document.querySelector('app-root')
        const cs = getComputedStyle(root)
        return JSON.stringify({ rootBg: cs.backgroundColor, themeStyleLen: document.querySelector('style#theme')?.textContent?.length })
    })()`)
    console.log('[4] 基础状态:', r.result?.result?.value)
    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
