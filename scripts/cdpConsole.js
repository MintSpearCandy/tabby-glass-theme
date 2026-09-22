/**
 * 启动期抢挂 CDP, 收集渲染进程 console 输出 (插件发现/加载日志都在这里)
 * 用法: node scripts/cdpConsole.js [等待秒数, 默认 12]
 */
const PORT = process.env.CDP_PORT || 9223
const WAIT_MS = (parseInt(process.argv[2]) || 12) * 1000

async function main () {
    // 轮询等 page target 出现, 立即挂载
    let main = null
    const t0 = Date.now()
    while (Date.now() - t0 < 30000) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
            main = targets.filter(t => t.type === 'page').find(t => t.url.includes('index'))
            if (main) break
        } catch {}
        await new Promise(r => setTimeout(r, 200))
    }
    if (!main) throw new Error('no page target in 30s')
    console.log('attached to page target')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
        if (m.method === 'Runtime.consoleAPICalled') {
            const args = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
            console.log(`[console.${m.params.type}]`, args.slice(0, 400))
        }
        if (m.method === 'Log.entryAdded') {
            console.log(`[log.${m.params.entry.level}]`, (m.params.entry.text || '').slice(0, 400))
        }
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails
            console.log('[exception]', (d.text + ' ' + (d.exception?.description || '')).slice(0, 600))
        }
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    await send('Runtime.enable')
    await send('Log.enable')
    await new Promise(r => setTimeout(r, WAIT_MS))
    ws.close()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
