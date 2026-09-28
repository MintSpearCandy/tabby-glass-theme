/**
 * 总开关引擎全量回归套件 (重构后门禁: 全绿才交付)
 * 场景: 开态启动 / 开关循环 / 换配色闭环 / 改字体保留 / 静置无风暴
 * 用法: node scripts/probeSuite.js   (CDP_PORT 默认 9290)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9290
const CFG = process.env.GLASS_CFG || 'D:/Env/TabbyEnv/instances/main/data/config.yaml'

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}

async function main () {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const main = list.filter(t => t.type === 'page').find(t => t.url.includes('/resource') || t.url.includes('index'))
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    const logs = []
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data)
        if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return }
        if (m.method === 'Runtime.consoleAPICalled') {
            const t = m.params.args.map(a => a.value || '').join(' ')
            if (t.includes('glass')) logs.push(t.slice(0, 100))
        }
    })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evl = async ex => {
        const r = await send('Runtime.evaluate', { returnByValue: true, expression: ex })
        if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || '').slice(0, 200))
        return r.result.result.value
    }
    await send('Runtime.enable')

    const state = () => evl(`JSON.stringify({
        enabled: window.__glassConfig._store.glass?.themeEnabled,
        isGlass: document.getElementById('theme').textContent.includes('.glass-lock-badge'),
        cssLen: document.getElementById('theme').textContent.length,
        csBg: window.__glassConfig.store.terminal.colorScheme?.background,
        rootInline: document.documentElement.style.cssText.length,
        themeVarBg: getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim(),
        locked: document.documentElement.classList.contains('glass-locked'),
        vars: (document.querySelector('#glass-vars')||{textContent:''}).textContent.length,
        font: window.__glassConfig.store.terminal.font,
    })`)
    const j = async () => JSON.parse(await state())

    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 1000)); if (await evl('!!window.__glassConfig').catch(() => false)) break }
    await new Promise(r => setTimeout(r, 2500))

    console.log('== 1. 开态启动 (即时就绪) ==')
    const boot = await j()
    check('Glass CSS 即时生效', boot.isGlass === true, JSON.stringify(boot))
    check('变量已消毒 (非透明 --theme-bg)', !boot.themeVarBg.includes(', 0)'), 'val=' + boot.themeVarBg)
    check('锁定态 class', boot.locked === true)

    console.log('== 2. 开关循环 ×4 (无透明残留/无奇偶) ==')
    const results = []
    for (let round = 1; round <= 4; round++) {
        await evl('window.__glassSetTheme(true);1'); await new Promise(r => setTimeout(r, 2400))
        const on = await j()
        check(round + ' 开: Glass CSS', on.isGlass === true)
        check(round + ' 开: 背景接管透明', on.csBg === '#00000000', on.csBg)
        await evl('window.__glassSetTheme(false);1'); await new Promise(r => setTimeout(r, 3000))
        const off = await j()
        check(round + ' 关: 用户 CSS', off.isGlass === false)
        check(round + ' 关: 原生背景还原', /^#[0-9a-f]{6}$/i.test(off.csBg || ''), off.csBg)
        check(round + ' 关: 变量交还 (rootInline 正常)', off.rootInline > 1000, 'len=' + off.rootInline)
        check(round + ' 关: locked 移除', off.locked === false)
        results.push(off.csBg)
    }
    check('四轮关闭背景一致 (无奇偶)', new Set(results).size === 1, results.join(','))

    console.log('== 3. 换配色闭环 ==')
    await evl('window.__glassSetTheme(true);1'); await new Promise(r => setTimeout(r, 2400))
    await evl(`window.__glassConfig.store.terminal.colorScheme={__nonStructural:true,name:'Material',foreground:'#e5e5e5',background:'#1e1e1e',cursor:'#e5e5e5',colors:['#000','#f15a60','#7fc066','#f9ee98','#5aa9f6','#c9a2f0','#64b8c8','#e5e5e5','#666','#f15a60','#7fc066','#f9ee98','#5aa9f6','#c9a2f0','#64b8c8','#fff']};window.__glassConfig.save().then(()=>1);1`)
    await new Promise(r => setTimeout(r, 2600))
    const sw = await j()
    check('Glass 中换配色: 保留新配色', sw.csBg !== undefined)
    check('Glass 中换配色: 背景仍透明', sw.csBg === '#00000000', sw.csBg)
    await evl('window.__glassSetTheme(false);1'); await new Promise(r => setTimeout(r, 3000))
    await evl('window.__glassSetTheme(true);1'); await new Promise(r => setTimeout(r, 2400))
    await evl('window.__glassSetTheme(false);1'); await new Promise(r => setTimeout(r, 3000))
    const swOff = await j()
    check('换色后再开关: Material + 原生 #1e1e1e 还原', swOff.csBg === '#1e1e1e', swOff.csBg)

    console.log('== 4. 字体保留 (Glass 改字体 → 关闭保留) ==')
    await evl('window.__glassSetTheme(true);1'); await new Promise(r => setTimeout(r, 2400))
    await evl(`window.__glassConfig.store.terminal.font='JetBrains Mono';window.__glassConfig.save().then(()=>1);1`)
    await new Promise(r => setTimeout(r, 2400))
    await evl('window.__glassSetTheme(false);1'); await new Promise(r => setTimeout(r, 3000))
    const f = await j()
    check('关闭后字体保留', f.font === 'JetBrains Mono', f.font)
    check('yaml 落盘', /font: JetBrains Mono/.test(fs.readFileSync(CFG, 'utf8')))

    console.log('== 5. 静置无风暴 (8s mtime 稳定) ==')
    await new Promise(r => setTimeout(r, 2000))
    const m1 = fs.statSync(CFG).mtimeMs
    await new Promise(r => setTimeout(r, 8000))
    check('无 save 风暴', m1 === fs.statSync(CFG).mtimeMs)

    // 恢复: 关闭态 + 还原 Material 之前的状态由测试自然留下 (关闭态)
    console.log(`\n结果: ${pass} pass / ${fail} fail`)
    console.log('glass 日志(尾8):', logs.slice(-8).join('\n'))
    ws.close()
    process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
