/**
 * Theme 锁定引擎全链路验证 (快照方案):
 *   阶段1 开锁: 锁定值写入 store+落盘 / 用户原值快照持久化 / 守约重置 / html class / 徽标
 *   阶段2 解锁: 按快照还原用户原值 / 清理标记 / 徽标移除
 *   阶段3 (传 --restart): 重启后锁定持续; 再解锁仍能还原
 * 用法: node scripts/probeThemeLock.js [--restart]   (CDP_PORT 默认 9231)
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

async function main () {
    const restart = process.argv.includes('--restart')
    const conn = await connectMain()
    for (let i = 0; i < 40; i++) { await sleep(500); if (await conn.evalIn(`!!document.querySelector('.btn-tab-bar')`)) break }

    if (restart) {
        console.log('== 阶段3: 重启后锁定持续 + 解锁还原 ==')
        const j = JSON.parse(await conn.evalIn(`JSON.stringify({
            flexTabsStore: window.__glassConfig.store.appearance.flexTabs,
            lockedClass: document.documentElement.classList.contains('glass-locked'),
            backup: window.__glassConfig._store.glass?.lockBackup,
        })`))
        check('重启后锁定持续 (store.flexTabs === false)', j.flexTabsStore === false, JSON.stringify(j))
        check('重启后 html.glass-locked 存在', j.lockedClass === true)
        check('重启后快照仍在 (lockBackup.appearance.flexTabs === true)', j.backup?.['appearance.flexTabs'] === true)
        // 解锁还原
        await conn.evalIn(`window.__glassSetLock(false); 1`)
        await sleep(2500)
        const u = JSON.parse(await conn.evalIn(`JSON.stringify({
            flexTabs: window.__glassConfig.store.appearance.flexTabs,
            backup: window.__glassConfig._store.glass?.lockBackup,
        })`))
        check('重启后解锁 → 用户原值 true 还原', u.flexTabs === true, JSON.stringify(u))
        check('解锁后快照清空', Object.keys(u.backup || {}).length === 0)
        const yaml = fs.readFileSync(CFG, 'utf8')
        check('最终 yaml flexTabs 恢复 true', /flexTabs: true/.test(yaml))
        console.log(`\n结果: ${pass} pass / ${fail} fail`)
        conn.ws.close()
        process.exit(fail ? 1 : 0)
    }

    console.log('== 初始状态 (config 预置: flexTabs:true, themeLock 未设) ==')
    const init = JSON.parse(await conn.evalIn(`JSON.stringify({
        flexTabs: window.__glassConfig.store.appearance.flexTabs,
        raw: window.__glassConfig._store.appearance.flexTabs,
    })`))
    check('初始 store.flexTabs === true (用户预置值)', init.flexTabs === true, JSON.stringify(init))

    console.log('== 阶段1: __glassSetLock(true) ==')
    await conn.evalIn(`window.__glassSetLock(true); 1`)
    await sleep(2500)
    const locked = JSON.parse(await conn.evalIn(`JSON.stringify({
        flexTabs: window.__glassConfig.store.appearance.flexTabs,
        bg: window.__glassConfig.store.terminal.background,
        tabsLoc: window.__glassConfig.store.appearance.tabsLocation,
        opacity: window.__glassConfig.store.appearance.opacity,
        lockedClass: document.documentElement.classList.contains('glass-locked'),
        backup: window.__glassConfig._store.glass?.lockBackup,
    })`))
    check('store.flexTabs 读到锁定值 false', locked.flexTabs === false, JSON.stringify(locked))
    check('store.terminal.background === theme', locked.bg === 'theme')
    check('store.appearance.tabsLocation === top', locked.tabsLoc === 'top')
    check('store.appearance.opacity === 0.93', locked.opacity === 0.93)
    check('html.glass-locked 存在', locked.lockedClass === true)
    check('用户原值快照持久化 (backup[appearance.flexTabs] === true)', locked.backup?.['appearance.flexTabs'] === true)
    const yaml1 = fs.readFileSync(CFG, 'utf8')
    // 锁定值 flexTabs:false == Tabby 默认值 → ConfigProxy deepEqual 机制将键从 _store 移除 (yaml 无该行)
    check('yaml: 用户值 flexTabs:true 已被锁定替换 (行消失或为 false)', !/flexTabs: true/.test(yaml1))
    check('yaml: 快照已落盘 (lockBackup)', /lockBackup/.test(yaml1))

    // 守约重置: 直接改被锁项 + save → changed$ 守约重写锁定值
    await conn.evalIn(`window.__glassConfig.store.appearance.flexTabs = true; window.__glassConfig.save().then(()=>1); 1`)
    await sleep(2500)
    const guard = await conn.evalIn(`window.__glassConfig.store.appearance.flexTabs`)
    check('守约重置: 改动被锁项+save 后弹回锁定值 false', guard === false)

    // 徽标 (设置 → Window 页)
    await conn.evalIn(`(() => { [...document.querySelectorAll('.btn-tab-bar')].find(b=>/gear/i.test(b.innerHTML)).click(); return 1 })()`)
    for (let i = 0; i < 20; i++) { await sleep(500); if (await conn.evalIn(`!!document.querySelector('settings-tab .nav-pills')`)) break }
    await conn.evalIn(`(() => { const l=[...document.querySelectorAll('settings-tab .nav-pills a')].find(a=>/window/i.test(a.textContent)); if(l) l.click(); return 1 })()`)
    await sleep(1200)
    const badges = await conn.evalIn(`document.querySelectorAll('settings-tab .glass-lock-badge').length`)
    check(`设置 → Window 页锁定徽标 ≥ 6 (实际 ${badges})`, badges >= 6)

    console.log('== 阶段2: __glassSetLock(false) ==')
    await conn.evalIn(`window.__glassSetLock(false); 1`)
    await sleep(2500)
    const unlocked = JSON.parse(await conn.evalIn(`JSON.stringify({
        flexTabs: window.__glassConfig.store.appearance.flexTabs,
        lockedClass: document.documentElement.classList.contains('glass-locked'),
        badges: document.querySelectorAll('.glass-lock-badge').length,
    })`))
    check('解锁后用户原值还原 (flexTabs === true)', unlocked.flexTabs === true, JSON.stringify(unlocked))
    check('解锁后 html.glass-locked 移除', unlocked.lockedClass === false)
    check('解锁后徽标清零', unlocked.badges === 0)
    const yaml2 = fs.readFileSync(CFG, 'utf8')
    check('解锁后 yaml flexTabs 恢复 true', /flexTabs: true/.test(yaml2))

    // 重新开启并落盘 (供阶段3 重启验证)
    await conn.evalIn(`window.__glassSetLock(true); 1`)
    await sleep(2500)

    console.log(`\n结果: ${pass} pass / ${fail} fail`)
    conn.ws.close()
    process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
