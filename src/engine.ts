/**
 * Glass 主题总开关引擎 (CSS 直写隔离方案)
 *
 * 分层结构 (自上而下, 每层只与相邻层交互):
 *   css    — Glass CSS 直接写入/写回 <style id="theme">, 不经 ThemesService 任何恢复链
 *   config — 冲突配置锁定 (guarded) + 显示偏好迁移, 快照持久存 glass.lockBackup
 *   scheme — 终端配色字段级接管: 仅 background 置透明, 原生色持久存 glass.userSchemeBg
 *   vars   — --theme-* 变量消毒: 透明背景会被 ThemesService 的 Color 运算放大成
 *            全系透明 (含 -fg 文字色), 接管期间由本引擎重定义受污染变量
 *   visual — 壁纸 CSS 变量 / 锁定徽标 / html.glass-locked
 *   guard  — changed$ 与启动路径的宏任务复查 (本插件订阅链先于 ThemesService,
 *            同步写入必被其后覆盖, 一律 setTimeout(0) 补写)
 *
 * 时序铁律: 所有"写入后可能被 ThemesService 覆盖"的操作 (CSS/变量) 都必须
 * 在宏任务里复查一次; 所有比较必须剔除实现标记 (__nonStructural) 与透明值.
 */
import { Injector, ApplicationRef, NgZone } from '@angular/core'
import { ConfigService, HostWindowService, BOOTSTRAP_DATA } from 'tabby-core'

export const GLASS_CSS: string = require('./theme.scss')

export interface OverrideSpec {
    section: 'appearance'|'terminal'|null
    key: string
    value: any
    /** true = changed$ 守约 (开启期间被改动即重置) */
    guarded?: boolean
}

/** 终端透明背景色 (xterm canvas 透明 → 壁纸透出) */
export const TRANSPARENT_BG = '#00000000'

export class GlassSwitchEngine {
    private readonly config: ConfigService
    private readonly injector: Injector

    /** 用户主题 CSS 快照 (会话内存; 重启后由配置态重建, 无需持久) */
    private userThemeCss: string | null = null

    private lockBadgeObserver: MutationObserver|null = null
    private badgeObserverTimer: any = null

    constructor (injector: Injector) {
        this.injector = injector
        this.config = injector.get(ConfigService)
    }

    // ============ config 层: 锁定/迁移表与访问工具 ============

    /** 需要在初始化时由调用方注入 (IR_BLACK 定义在 index.ts 模块级) */
    overrides: OverrideSpec[] = []

    private get raw (): any { return (this.config as any)._store }

    private rawValue (spec: OverrideSpec): any {
        return spec.section ? this.raw?.[spec.section]?.[spec.key] : this.raw?.[spec.key]
    }

    /** store 视图值 (proxy get, real 无值时回退 defaults) —— 守约比较必须用它:
     *  ConfigProxy 对 deepEqual 默认值的写入会从 _store 删键, 按 raw 比较会
     *  永远误判 drift, 与 changed$ 形成 save 死循环 */
    private storeValue (spec: OverrideSpec): any {
        return spec.section ? this.config.store[spec.section][spec.key] : (this.config.store as any)[spec.key]
    }

    private writeValue (spec: OverrideSpec, value: any): void {
        if (spec.section) {
            this.config.store[spec.section][spec.key] = value
        } else {
            ;(this.config.store as any)[spec.key] = value
        }
    }

    private static sameValue (a: any, b: any): boolean {
        if (a === b) { return true }
        if (typeof a === 'object' && typeof b === 'object' && a && b) {
            return JSON.stringify(a) === JSON.stringify(b)
        }
        return false
    }

    // ============ 开关状态 ============

    get enabled (): boolean { return this.raw?.glass?.themeEnabled !== false }

    private hasBackup (): boolean {
        const b = this.raw?.glass?.lockBackup
        return !!b && Object.keys(b).length > 0
    }

    // ============ scheme 层: 配色字段级接管 ============

    private static isPlainObject (v: any): boolean {
        return !!v && typeof v === 'object' && !Array.isArray(v)
    }

    private static withTransparentBg (cs: any): any {
        return { __nonStructural: true, ...cs, background: TRANSPARENT_BG }
    }

    /** 比较配色是否同一套 (剔除 background 与 __nonStructural 实现标记;
     *  标记差异曾致"换过配色"假阳性 → 透明背景残留的奇偶混乱) */
    private static sameSchemeIgnoringBg (a: any, b: any): boolean {
        if (!GlassSwitchEngine.isPlainObject(a) || !GlassSwitchEngine.isPlainObject(b)) { return a === b }
        const strip = (o: any) => {
            const { background: _bg, __nonStructural: _ns, ...rest } = o
            return rest
        }
        return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
    }

    /** 防御迁移: 历史上 terminal.background 的锁定值曾串位写进 colorScheme 对象
     *  (background='colorScheme' 等非法色值 → xterm 画布与边缘色差), 检测到即移除对象 */
    private repairCorruptedColorScheme (): void {
        const cs = this.raw?.terminal?.colorScheme
        if (cs && typeof cs.background === 'string' && !/^#|^rgb/i.test(cs.background)) {
            console.log('[glass] repair: corrupted colorScheme.background=' + JSON.stringify(cs.background) + ', removing object')
            delete this.raw.terminal.colorScheme
        }
    }

    // ============ css 层: Glass CSS 直写 ============

    cssActive (): boolean {
        const el = document.querySelector('style#theme') as HTMLStyleElement | null
        return !!el && el.textContent.includes('.glass-lock-badge') // Glass 独有标记
    }

    applyCss (): void {
        let el = document.querySelector('style#theme') as HTMLStyleElement | null
        if (!el) {
            el = document.createElement('style')
            el.id = 'theme'
            document.head.appendChild(el)
        }
        // 首次遇到"非 Glass 的用户主题 CSS"时快照 (不覆盖已有快照)
        if (this.userThemeCss === null && !this.cssActive() && el.textContent) {
            this.userThemeCss = el.textContent
        }
        el.textContent = GLASS_CSS
    }

    restoreUserCss (): void {
        const el = document.querySelector('style#theme') as HTMLStyleElement | null
        if (!el) { return }
        if (this.userThemeCss !== null) {
            el.textContent = this.userThemeCss
            this.userThemeCss = null
        }
        // 无快照 (重启后关闭): 当前已是用户主题 CSS (ThemesService 按 (未变的)
        // appearance.theme 正常应用), 无需动作
    }

    // ============ vars 层: --theme-* 变量消毒 ============

    /** 透明配色背景被 ThemesService 的 Color 运算 (lighten/darken 保留 alpha=0)
     *  污染成全系的 hsla(0,0%,0%,0) (含 -fg 文字色 → 淡色文字集体透明消失).
     *  接管期间由引擎重定义受污染变量 (Glass 深色调). */
    private static readonly THEME_VARS: Record<string, string> = {
        '--theme-bg': 'rgba(10,12,18,0.72)',
        '--theme-bg-more': 'rgba(16,19,28,0.82)',
        '--theme-bg-more-2': 'rgba(22,26,38,0.9)',
        '--theme-bg-less': 'rgba(6,8,12,0.55)',
        '--theme-bg-less-2': 'rgba(3,4,7,0.4)',
        '--theme-dark': '#17181d',
        '--theme-dark-more': '#101115',
        '--theme-dark-more-2': '#0a0b0e',
        '--theme-dark-less': '#2b2d36',
        '--theme-dark-less-2': '#40434f',
        '--theme-dark-fg': '#e8e8ec',
        '--theme-dark-active-bg': '#2b2d36',
        '--theme-dark-active-fg': '#ffffff',
        '--theme-secondary': '#1b1d24',
        '--theme-secondary-more': '#14161c',
        '--theme-secondary-more-2': '#0e0f14',
        '--theme-secondary-less': '#2f323d',
        '--theme-secondary-less-2': '#464a58',
        '--theme-secondary-fg': '#c9ccd6',
        '--theme-secondary-active-bg': '#2f323d',
        '--theme-secondary-active-fg': '#ffffff',
        '--theme-tertiary': '#20232c',
        '--theme-tertiary-more': '#171a21',
        '--theme-tertiary-more-2': '#101218',
        '--theme-tertiary-less': '#353947',
        '--theme-tertiary-less-2': '#4d5263',
        '--theme-tertiary-fg': '#b3b7c4',
        '--theme-tertiary-active-bg': '#353947',
        '--theme-tertiary-active-fg': '#ffffff',
        // --bs-* 系: 与 --theme-* 同一条计算链, 同样被透明背景污染
        // (漏掉时: 次要文字/下拉非激活项透明) —— 值与主题字色提亮体系对齐
        '--bs-secondary-color': 'rgba(255, 255, 255, 0.75)',
        '--bs-secondary-color-rgb': '255, 255, 255',
        '--bs-tertiary-color': 'rgba(255, 255, 255, 0.55)',
        '--bs-tertiary-color-rgb': '255, 255, 255',
        '--bs-secondary-bg': '#14161c',
        '--bs-tertiary-bg': '#0e0f14',
        '--bs-secondary': '#1b1d24',
        '--bs-tertiary': '#20232c',
        '--bs-dark': '#17181d',
        '--bs-dark-bg': '#101115',
        '--bs-dark-color': '#e8e8ec',
    }

    private applyThemeVars (): void {
        if (!this.enabled) {
            for (const k of Object.keys(GlassSwitchEngine.THEME_VARS)) {
                document.documentElement.style.removeProperty(k)
            }
            return
        }
        for (const [k, v] of Object.entries(GlassSwitchEngine.THEME_VARS)) {
            document.documentElement.style.setProperty(k, v)
        }
    }

    // ============ visual 层: 壁纸变量 / 徽标 / locked class ============

    /** 壁纸默认路径 (BOOTSTRAP_DATA.userPluginsPath 推导; window.bootstrapData 全局不存在) */
    private cachedDataDir: string|null = null
    defaultWallpaper (): string {
        if (this.cachedDataDir !== null) { return this.cachedDataDir + '/resources/background.jpg' }
        try {
            const bp: any = this.injector.get(BOOTSTRAP_DATA)
            const p: string|undefined = bp?.userPluginsPath
            if (typeof p === 'string' && p.length > 0) {
                this.cachedDataDir = p.replace(/[\\/](plugins|node_modules)([\\/].*)?$/i, '').replace(/\\/g, '/')
                return this.cachedDataDir + '/resources/background.jpg'
            }
        } catch { /* 不可用时无壁纸 */ }
        this.cachedDataDir = ''
        return ''
    }

    /** 壁纸 CSS 变量 + 变量消毒 (对外的统一刷新口) */
    refreshVisuals (): void {
        this.applyThemeVars()
        const off = !this.enabled
        let styleEl = document.querySelector('style#glass-vars') as HTMLStyleElement | null
        if (off) {
            if (styleEl) { styleEl.textContent = '' }
            return
        }
        const g = this.config.store.glass ?? {}
        if (!styleEl) {
            styleEl = document.createElement('style')
            styleEl.id = 'glass-vars'
            document.head.appendChild(styleEl)
        }
        const wp: string = g.wallpaper || this.defaultWallpaper()
        const enabled = g.wallpaperEnabled !== false
        let imageValue = 'none'
        if (wp && enabled) {
            // 协议判定必须含 '//' —— 单字母盘符 'D:' 会被 '^[a-z]+:' 误判为协议
            const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(wp) ? wp : 'file:///' + wp.replace(/\\/g, '/')
            imageValue = `url("${url}")`
        }
        styleEl.textContent = `:root{--glass-wallpaper-image:${imageValue};` +
            `--glass-wallpaper-opacity:${g.wallpaperOpacity ?? 0.7};` +
            `--glass-overlay-top:${g.overlayTop ?? 0.5};` +
            `--glass-overlay-bottom:${g.overlayBottom ?? 0.78}}`
    }

    private static readonly LOCK_BADGE_TEXT_RE = /opacity|window frame|tabs location|tabs width|acrylic background|vibrancy|background type|profile sidebar|dock the terminal|terminal background|不透明度|窗口边框|边框|标签页?位置|标签页?宽度|亚克力|模糊|背景类型|终端背景|配置文件|个人资料|侧边栏|停靠/

    private injectLockBadges (): void {
        const titles = document.querySelectorAll('settings-tab .header .title')
        titles.forEach(t => {
            const text = (t.textContent || '').trim()
            if (!text || !GlassSwitchEngine.LOCK_BADGE_TEXT_RE.test(text.toLowerCase()) || t.querySelector('.glass-lock-badge')) { return }
            const badge = document.createElement('i')
            badge.className = 'fas fa-lock glass-lock-badge'
            badge.title = '已由 Glass 主题锁定 (Glass 设置页可关闭主题开关)'
            t.appendChild(badge)
        })
    }

    /** observer 与回调必须在 Angular zone 之外 (zone 内会与 CD 无限共振 →
     *  微任务饥饿, 历史上 Hotkeys 页卡死 + save() 永不 resolve 的根因) */
    private startBadgeObserver (): void {
        if (this.lockBadgeObserver) { return }
        let zone: any
        try { zone = this.injector.get(NgZone) } catch { zone = null }
        const scheduleInject = () => {
            if (this.badgeObserverTimer !== null) { return }
            this.badgeObserverTimer = setTimeout(() => {
                this.badgeObserverTimer = null
                if (!document.querySelector('settings-tab')) { return }
                this.injectLockBadges()
            }, 200)
        }
        const start = () => {
            if (this.lockBadgeObserver) { return }
            this.lockBadgeObserver = new MutationObserver(scheduleInject)
            this.lockBadgeObserver.observe(document.body, { childList: true, subtree: true })
            this.injectLockBadges()
        }
        if (zone?.runOutsideAngular) {
            zone.runOutsideAngular(start)
        } else {
            start()
        }
    }

    private stopBadgeObserver (): void {
        if (this.badgeObserverTimer !== null) {
            clearTimeout(this.badgeObserverTimer)
            this.badgeObserverTimer = null
        }
        this.lockBadgeObserver?.disconnect()
        this.lockBadgeObserver = null
        document.querySelectorAll('.glass-lock-badge').forEach(el => el.remove())
    }

    private setVisualState (on: boolean): void {
        document.documentElement.classList.toggle('glass-locked', on)
        if (on) {
            this.startBadgeObserver()
        } else {
            this.stopBadgeObserver()
        }
    }

    // ============ 开关主流程 ============

    enable (): void {
        console.log('[glass] enable: start')
        const backup: any = {}
        for (const spec of this.overrides) {
            const id = (spec.section ?? '_') + '.' + spec.key
            let current = this.rawValue(spec)
            if (spec.key === 'colorScheme') {
                // 残留防御: 上轮"换过配色"路径留下的透明 background, 用持久原生色修复
                if (GlassSwitchEngine.isPlainObject(current) && current.background === TRANSPARENT_BG) {
                    const saved = this.raw?.glass?.userSchemeBg
                    if (saved && saved.name === current.name && typeof saved.background === 'string' && saved.background !== TRANSPARENT_BG) {
                        current = { ...current, background: saved.background }
                        console.log('[glass] enable: restore native scheme bg ' + saved.background)
                    }
                }
                // 原生色持久记录 → 接管 (仅 background 置透明, name/前景/16 色保留)
                if (GlassSwitchEngine.isPlainObject(current) && current.background !== TRANSPARENT_BG) {
                    this.config.store.glass.userSchemeBg = { name: current.name, background: current.background }
                }
                backup[id] = current
                this.writeValue(spec, GlassSwitchEngine.isPlainObject(current) ? GlassSwitchEngine.withTransparentBg(current) : spec.value)
                continue
            }
            backup[id] = current
            // 守约组强制写; 迁移组仅"补默认" (尊重用户显式值)
            if (spec.guarded || current === undefined) {
                this.writeValue(spec, spec.value)
            }
        }
        this.config.store.glass.lockBackup = backup
        this.config.store.glass.themeEnabled = true
        console.log('[glass] enable: snapshot keys=' + Object.keys(backup).length)
        const hostWindow = this.injector.get(HostWindowService) as any
        hostWindow.setOpacity?.(0.93)
        this.applyCss()
        this.config.save().then(
            () => console.log('[glass] enable: save done'),
            e => console.log('[glass] enable: SAVE REJECT', e),
        )
    }

    disable (): void {
        console.log('[glass] disable: start')
        const backup: any = this.raw?.glass?.lockBackup ?? {}
        if (!backup || Object.keys(backup).length === 0) {
            console.log('[glass] disable: EMPTY BACKUP (快照缺失, 迁移键无法还原)')
        }
        for (const spec of this.overrides) {
            const id = (spec.section ?? '_') + '.' + spec.key
            const original = backup[id]
            if (spec.key === 'colorScheme') {
                // 独立还原 (禁止落入通用分支 —— 其以 IR_BLACK 为基准会把"原配色+透明"
                // 误判为用户改过而跳过还原 → 透明残留):
                //   未换配色 → 完整还原快照 (原生 background); 换过 → 保留新选择
                const cur = this.rawValue(spec)
                if (GlassSwitchEngine.isPlainObject(original) && GlassSwitchEngine.isPlainObject(cur)
                    && !GlassSwitchEngine.sameSchemeIgnoringBg(cur, original)) {
                    console.log('[glass] disable: keep user-switched colorScheme')
                } else if (original === undefined) {
                    delete this.raw.terminal.colorScheme
                } else {
                    this.writeValue(spec, original)
                }
                continue
            }
            // 迁移组条件还原: 用户改过的键保留 (不吞 Glass 期间的调整)
            if (!spec.guarded && !GlassSwitchEngine.sameValue(this.rawValue(spec), spec.value)) {
                console.log('[glass] disable: keep user-modified ' + id)
                continue
            }
            if (original === undefined) {
                if (spec.section) {
                    delete this.raw[spec.section][spec.key]
                } else {
                    delete this.raw[spec.key]
                }
            } else {
                this.writeValue(spec, original)
            }
        }
        this.config.store.glass.themeEnabled = false
        this.config.store.glass.lockBackup = {}
        const userOpacity = typeof backup['appearance.opacity'] === 'number' ? backup['appearance.opacity'] : 1
        const hostWindow = this.injector.get(HostWindowService) as any
        hostWindow.setOpacity?.(userOpacity)
        this.restoreUserCss()
        this.config.save().then(
            () => console.log('[glass] disable: save done'),
            e => console.log('[glass] disable: SAVE REJECT', e),
        )
    }

    set (on: boolean): void {
        if (on) {
            this.enable()
        } else {
            this.disable()
        }
        this.setVisualState(on)
        this.refreshVisuals()
        try {
            this.injector.get(ApplicationRef).tick()
        } catch { /* ApplicationRef 不可用时跳过 */ }
    }

    /** 宏任务复查: CSS 与变量都可能在本轮事件中被 ThemesService 覆盖
     *  (本引擎的订阅链先于它执行), 统一延后一拍校正 */
    private macrotaskGuard (tag: string): void {
        setTimeout(() => {
            if (!this.enabled) { return }
            if (!this.cssActive()) {
                console.log('[glass] guard(' + tag + '): css overwritten, re-applying')
                this.applyCss()
            }
            this.applyThemeVars()
        }, 0)
    }

    // ============ 生命周期入口 ============

    /** ready$ 后调用一次 */
    boot (): void {
        console.log('[glass] init: themeEnabled=' + this.enabled + ' hasBackup=' + this.hasBackup())
        this.repairCorruptedColorScheme()
        if (this.enabled && !this.hasBackup()) {
            this.enable()
        }
        if (!this.enabled && this.hasBackup()) {
            this.disable() // 崩溃/强杀残留自愈
        }
        if (this.enabled) {
            this.applyCss()
        }
        this.setVisualState(this.enabled)
        this.refreshVisuals()
        this.macrotaskGuard('boot')
    }

    /** changed$ 每次调用 (守约: CSS/变量/锁定配置/配色透明) */
    onConfigChanged (): void {
        this.refreshVisuals()
        if (this.enabled) {
            this.macrotaskGuard('changed$')
            let drifted = false
            for (const spec of this.overrides) {
                if (spec.guarded && !GlassSwitchEngine.sameValue(this.storeValue(spec), spec.value)) {
                    console.log('[glass] guard drift: ' + (spec.section ?? '_') + '.' + spec.key)
                    this.writeValue(spec, spec.value)
                    drifted = true
                }
            }
            // 配色背景字段级守约: 任何来源写入的不透明 background 保持透明;
            // 透明化前记录该配色的原生色. 不主动 save (由触发链自然落盘)
            const csSpec = this.overrides.find(o => o.key === 'colorScheme')
            const cs = csSpec ? this.rawValue(csSpec) : null
            if (csSpec && GlassSwitchEngine.isPlainObject(cs) && cs.background !== TRANSPARENT_BG) {
                console.log('[glass] guard: colorScheme.background -> transparent')
                this.config.store.glass.userSchemeBg = { name: cs.name, background: cs.background }
                this.writeValue(csSpec, GlassSwitchEngine.withTransparentBg(cs))
            }
            if (drifted) {
                this.config.save().then(
                    () => console.log('[glass] guard: save done'),
                    e => console.log('[glass] guard: SAVE REJECT', e),
                )
            }
            this.setVisualState(true)
        }
    }
}
