/**
 * save 链全诊断: 读探针 → 实测 save() → 双向核对
 * node scripts/diagnoseSave.js
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9223
const CONFIG = 'D:/App/Tabby/data/plugins/../../../../../../App/Tabby/data/config.yaml' // 占位

async function main () {
    const mtimeBefore = fs.statSync('D:/Home/Project/TabbyPlugins/GlassTheme/test-env/tabby-debug-cfg/config.yaml').mtime.toISOString()
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
    const evaluate = ex => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } })) })
    const sleep = ms => new Promise(r => setTimeout(r, ms))

    await sleep(8000)  // 等引导 + 迁移

    // 1. 探针: 迁移链 + _store 实际键
    let r = await evaluate('JSON.stringify(window.__glassStep)')
    console.log('[1] 执行链:', r.result?.result?.value)

    // 2. _store 直查: 迁移值在不在 real 树
    r = await evaluate('JSON.stringify({ terminal: Object.keys(__glassConfig._store.terminal || {}), appearance: Object.keys(__glassConfig._store.appearance || {}) })')
    console.log('[2] _store 键:', r.result?.result?.value)

    // 3. 实测 save(): awaitPromise 等真实结果
    r = await evaluate(`__glassConfig.save().then(() => 'SAVE OK', e => 'SAVE ERR: ' + e.message + ' | ' + (e.stack || '').split(String.fromCharCode(10))[1])`)
    console.log('[3] save() 结果:', r.result?.result?.value)

    // 4. 落盘核对 (debug cfg 的 mtime)
    await sleep(1500)
    const mtimeAfter = fs.statSync('D:/Home/Project/TabbyPlugins/GlassTheme/test-env/tabby-debug-cfg/config.yaml').mtime.toISOString()
    console.log('[4] config mtime:', mtimeBefore, '→', mtimeAfter, mtimeBefore !== mtimeAfter ? '(落盘成功)' : '(未变化!)')

    // 5. 落盘内容核对: terminal 迁移值上车了吗
    const content = fs.readFileSync('D:/Home/Project/TabbyPlugins/GlassTheme/test-env/tabby-debug-cfg/config.yaml', 'utf8')
    const termSection = content.split('terminal:')[1]?.split('\n')[0]
    const hasFont = /font: Cascadia/.test(content)
    const hasOpacity = /opacity: 0?\.93/.test(content)
    console.log('[5] 落盘含 font:', hasFont, '| opacity:', hasOpacity)

    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
