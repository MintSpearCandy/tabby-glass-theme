/**
 * Glass 主题总开关全链路验证:
 *   阶段0 首启: themeEnabled 默认开 → 自动接管 + 快照建立 (font 未设置 → 迁移组 undefined 场景)
 *   阶段1 开启态断言: theme=Glass + CSS 特征 + 锁定/迁移值 + 备份完整
 *   阶段2 关闭: theme 还原默认主题 + Glass CSS 卸载 (style#theme 特征切换) + 壁纸变量清空
 *              + 用户显式值 flexTabs 还原 + 迁移项还原 (yaml 无 font 行) + 快照清空
 *   阶段3 重开: 回到 Glass 世界
 *   阶段4 (--restart): 重启后开启持续
 * 用法: node scripts/probeThemeSwitch.js [--restart]   (CDP_PORT 默认 9231)
 */
const fs = require('fs')
const PORT = process.env.CDP_PORT || 9231
const CFG = 'D:/Home/Project/TabbyPlugins/WebViewer/test-env/tabby-port/data/config.yaml'

async function connectMain () {
    let list
    for (let i = 0; i < 20; i++) {
        try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break } catch { await new Promise(r => setTimeout(r, 2000)) }
    }
    if (!list) throw new Error('/json/list unreachable')
    const main = list.filter(t => t.type === 'page').find(t => t.url.includes('/resource'))
    if (!main) throw new Error('no main window')
    const ws = new WebSocket(main.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 0
    const pend = new Map()
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id !== undefined && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evalIn = async ex => {
        const r = await send('Runtime.evaluate', { returnByValue: true, expression: ex })
        if (r.result.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300))
        return r.result.result.value
    }
    return { ws, send, evalIn }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}
const stateExpr = `(() => {
    const t = document.getElementById('theme')
    const c = window.__glassConfig
    const vars = document.querySelector('style#glass-vars')
    return JSON.stringify({
        themeStore: c.store.appearance.theme,
        cssIsGlass: !!(t && t.textContent.includes('current-tab-indicator{display:none}')),
        cssLen: t ? t.textContent.length : 0,
        flexTabs: c.store.appearance.flexTabs,
        font: c.store.terminal.font,
        opacity: c.store.appearance.opacity,
        enabled: c._store.glass?.themeEnabled,
        backup: c._store.glass?.lockBackup,
        lockedClass: document.documentElement.classList.contains('glass-locked'),
        varsLen: vars ? vars.textContent.length : -1,
    })
})()`

async function main () {
    const restart = process.argv.includes('--restart')
    const conn = await connectMain()
    for (let i = 0; i < 40; i++) { await sleep(500); if (await conn.evalIn(`!!document.querySelector('.btn-tab-bar')`) || await conn.evalIn(`!!window.__glassConfig`)) break }
    await sleep(2000) // 等首启接管 + changed$ 链跑完

    if (restart) {
        console.log('== 阶段4: 重启后开启态持续 ==')
        const j = JSON.parse(await conn.evalIn(stateExpr))
        check('重启后 theme=Glass', j.themeStore === 'Glass', JSON.stringify({ theme: j.themeStore, cssIsGlass: j.cssIsGlass }))
        check('重启后 Glass CSS 生效', j.cssIsGlass === true)
        check('重启后锁定持续 (flexTabs=false)', j.flexTabs === false)
        check('重启后快照在', j.backup && Object.keys(j.backup).length > 0)
        console.log(`\n结果: ${pass} pass / ${fail} fail`)
        conn.ws.close()
        process.exit(fail ? 1 : 0)
    }

    console.log('== 阶段0/1: 首启接管 + 开启态 ==')
    const on = JSON.parse(await conn.evalIn(stateExpr))
    check('theme=Glass', on.themeStore === 'Glass', JSON.stringify(on))
    check('Glass CSS 生效 (style#theme 含 Glass 特征)', on.cssIsGlass === true)
    check('锁定: flexTabs=false', on.flexTabs === false)
    check('迁移: font=Cascadia Code', on.font === 'Cascadia Code')
    check('锁定: opacity=0.93', on.opacity === 0.93)
    check('快照: 用户值 flexTabs:true 已存', on.backup?.['appearance.flexTabs'] === true)
    check('快照: theme 原值映射为默认主题', on.backup?.['appearance.theme'] === 'Follow the color scheme')
    check('快照: font 原值 undefined (JSON 丢弃, 关闭时删键)', !('terminal.font' in (on.backup || {})))
    check('html.glass-locked', on.lockedClass === true)
    check('壁纸变量非空', on.varsLen > 0)

    console.log('== 阶段2: 关闭 (__glassSetTheme(false)) ==')
    await conn.evalIn(`window.__glassSetTheme(false); 1`)
    await sleep(3000)
    const off = JSON.parse(await conn.evalIn(stateExpr))
    check('theme 还原默认主题', off.themeStore === 'Follow the color scheme', JSON.stringify({ theme: off.themeStore, glass: off.cssIsGlass }))
    check('Glass CSS 已卸载 (style#theme 无 Glass 特征)', off.cssIsGlass === false)
    check('CSS 长度变化 (默认主题 ≈752k ≠ Glass)', off.cssLen > 700000 && Math.abs(off.cssLen - on.cssLen) > 10000, `off=${off.cssLen} on=${on.cssLen}`)
    check('用户显式值还原 (flexTabs=true)', off.flexTabs === true)
    check('迁移项还原 (font=undefined→默认)', off.font === undefined || off.font === 'Consolas', JSON.stringify(off.font))
    check('快照清空', !off.backup || Object.keys(off.backup).length === 0)
    check('html.glass-locked 移除', off.lockedClass === false)
    check('壁纸变量已清空', off.varsLen === 0)
    const yamlOff = fs.readFileSync(CFG, 'utf8')
    check('yaml: theme 回默认主题名', /theme: Follow the color scheme/.test(yamlOff))
    check('yaml: flexTabs 回 true', /flexTabs: true/.test(yamlOff))
    check('yaml: 无 font 行 (还原未设置态)', !/font: Cascadia/.test(yamlOff))

    console.log('== 阶段3: 重开 (__glassSetTheme(true)) ==')
    await conn.evalIn(`window.__glassSetTheme(true); 1`)
    await sleep(3000)
    const re = JSON.parse(await conn.evalIn(stateExpr))
    check('重开: theme=Glass', re.themeStore === 'Glass')
    check('重开: Glass CSS 恢复', re.cssIsGlass === true)
    check('重开: 快照重建 (flexTabs:true)', re.backup?.['appearance.flexTabs'] === true)

    console.log(`\n结果: ${pass} pass / ${fail} fail`)
    conn.ws.close()
    process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
