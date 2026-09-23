import { NgModule, Injectable, Injector, ApplicationRef, NgZone } from '@angular/core'
import { Theme, ConfigProvider, ConfigService, HostWindowService, HotkeysService, HotkeyProvider, HotkeyDescription } from 'tabby-core'
import { TerminalColorSchemeProvider } from 'tabby-terminal'
import { SettingsTabProvider } from 'tabby-settings'

import { GlassSettingsTabProvider } from './glassSettings'
import { GlassSettingsTabComponent } from './glassSettingsTab.component'

// npm 发布的 tabby-core typings 缺少此接口导出 (本地源码有), 本地定义 (仅编译期)
interface TerminalColorScheme {
    name: string
    foreground: string
    background: string
    cursor: string
    colors: string[]
    selection?: string
    selectionForeground?: string
    cursorAccent?: string
}

/**
 * 深色玻璃质感主题 (方案 B: 窗口内 CSS 合成)
 *
 * Theme 三个核心属性:
 *  - name              设置 → 外观 → 主题 下拉框中的显示名
 *  - css               完整样式表 (整体替换 <style id="theme">, 须自带 Bootstrap)
 *  - terminalBackground 终端区域背景色
 */
@Injectable()
class GlassTheme extends Theme {
    name = 'Glass'
    css = require('./theme.scss')
    // 方案 B: 终端视口全透明, 露出主题 CSS 的壁纸+渐变图层
    // (xterm allowTransparency: true; vibrancy 关闭时此值生效)
    terminalBackground = '#00000000'
}

/**
 * IR_Black 配色方案 (wezterm colors.lua 同源)
 * 前景 #f1f1f1 (较 Tabby Default 的 #cacaca 提亮), 光标灰, 选区半透明白底灰字
 */
const IR_BLACK: TerminalColorScheme = {
    name: 'IR_Black',
    foreground: '#f1f1f1',
    background: '#000000',
    cursor: '#808080',
    cursorAccent: '#000000',
    selection: 'rgba(255, 255, 255, 0.15)',
    selectionForeground: '#9e9e9e',
    colors: [
        '#4f4f4f', '#fa6c60', '#a8ff60', '#fffeb7',
        '#96cafe', '#fa73fd', '#c6c5fe', '#efedef',
        '#7b7b7b', '#fcb6b0', '#cfffab', '#ffffcc',
        '#b5dcff', '#fb9cfe', '#e0e0fe', '#ffffff',
    ],
}

@Injectable()
class GlassColorSchemes extends TerminalColorSchemeProvider {
    async getSchemes (): Promise<TerminalColorScheme[]> {
        return [IR_BLACK]
    }
}

/** 声明快捷键 (默认键位由 GlassConfigProvider.defaults.hotkeys 提供, 设置 → 热键 可改) */
@Injectable()
class GlassHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            { id: 'glass-toggle-wallpaper', name: 'Glass: 切换背景图' },
        ]
    }
}

/**
 * 玻璃质感配置 (参照 wezterm background.lua / fonts.lua / colors.lua)
 *
 * appearance.opacity = 0.93 —— wezterm M.opacity, 整窗不透明度, 桌面透过 7%.
 * terminal.colorScheme = IR_Black —— 终端字体提亮 (#f1f1f1) + wezterm 同源 16 色.
 * terminal.font = Cascadia Code (回退 JetBrainsMono NF) —— wezterm fonts.lua 同款字体链;
 * 字重走默认 400 (wezterm 常规字重一致).
 *
 * 实现方式说明: ConfigProvider 的 defaults 合并方向是 "后注册者覆盖",
 * 但实测内置 yaml 默认值提供者 (CoreConfigProvider) 恒位于注入数组末尾,
 * 其内置值会覆盖任何插件默认值 —— 因此不走 defaults,
 * 改为配置就绪后的一次性迁移:
 *   - 检查用户原始配置 (_store): 未显式写过对应键才应用 (尊重用户设置)
 *   - 写入运行时 store (与任何后续配置变更保持一致) + 直接调用生效
 *   - 不主动落盘; 卸载主题后若无持久化即自动回退
 *
 * 想要完整亚克力材质 (wezterm M.acrylic = true): 设置里再开
 * appearance.vibrancy + vibrancyType: fluent, 主题 CSS 的 vibrant 分支已就绪.
 */
@Injectable()
class GlassConfigProvider extends ConfigProvider {
    defaults = {
        hotkeys: {
            'glass-toggle-wallpaper': ['Ctrl-Alt-B'],
        },
        glass: {
            wallpaper: 'D:/App/Tabby/data/resources/ac041_void棺材胡桃4k.jpg',
            wallpaperEnabled: true,
            wallpaperOpacity: 0.7,
            overlayTop: 0.5,
            overlayBottom: 0.78,
            themeEnabled: true,
            // __nonStructural: 允许整对象赋值经 proxy 写入 _store (结构性子对象只有 getter)
            lockBackup: { __nonStructural: true },
        },
    }

    constructor (injector: Injector) {
        super()
        // 必须延迟解析: 本 provider 在 ConfigService 构造期间被实例化,
        // 同步 injector.get(ConfigService) 会形成 DI 环 (NG0200) 炸掉整个引导.
        // ready$ 是 AsyncSubject —— 已完成时 subscribe 立即回调, 无需 toPromise.
        setTimeout(() => {
            const config = injector.get(ConfigService)
            config.ready$.subscribe(() => {
                // 主题可调项 → CSS 变量同步 (设置页改动即时生效).
                // 必须用自有 <style> 元素而非 documentElement inline style:
                // ThemesService.applyThemeVariables 会在每次 config.changed$ 时把
                // inline style 整体恢复为引导期备份, 后设的变量会被静默抹掉.
                const applyGlassVars = () => {
                    const styleEl0 = document.querySelector('style#glass-vars') as HTMLStyleElement | null
                    // 总开关关闭时清空壁纸变量 (Glass 世界的 CSS 旁路一并撤离)
                    if ((config as any)._store?.glass?.themeEnabled === false) {
                        if (styleEl0) { styleEl0.textContent = '' }
                        return
                    }
                    const g = config.store.glass ?? {}
                    let styleEl = document.querySelector('style#glass-vars') as HTMLStyleElement | null
                    if (!styleEl) {
                        styleEl = document.createElement('style')
                        styleEl.id = 'glass-vars'
                        document.head.appendChild(styleEl)
                    }
                    const wp: string = g.wallpaper ?? ''
                    const enabled = g.wallpaperEnabled !== false
                    let imageValue = 'none'
                    if (wp && enabled) {
                        // 协议判定必须含 '//' —— 单字母盘符 'D:' 会被 '^[a-z]+:' 误判为协议
                        // 导致漏加 file:/// 前缀, url() 解析失败壁纸不渲染
                        const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(wp) ? wp : 'file:///' + wp.replace(/\\/g, '/')
                        imageValue = `url("${url}")`
                    }
                    styleEl.textContent = `:root{--glass-wallpaper-image:${imageValue};` +
                        `--glass-wallpaper-opacity:${g.wallpaperOpacity ?? 0.7};` +
                        `--glass-overlay-top:${g.overlayTop ?? 0.5};` +
                        `--glass-overlay-bottom:${g.overlayBottom ?? 0.78}}`
                }

                // ============ Glass 主题总开关 (Theme 注入整体隔离) ============
                // 开 = Glass 接管: appearance.theme→Glass (CSS 由 ThemesService 整体注入) +
                //      冲突配置锁定 + 显示偏好迁移 (字体/配色/前端等);
                // 关 = 完整还原: theme 回用户原主题 (Glass CSS 随之卸载, 用户自定义 CSS 不动),
                //      所有被接管键按快照还原, CSS 旁路 (壁纸变量/锁定徽标) 一并清除.
                //
                // 背景约束 (Tabby 1.0.235 源码实证): ConfigProxy 访问器 configurable:false,
                // save() 无 before 钩子整体 dump _store → "运行时拦截、落盘零变化"不可行,
                // 故采用快照方案: 用户原值持久存于 glass.lockBackup (崩溃安全, 残留自愈).
                const GLASS_THEME_NAME = 'Glass'
                const FALLBACK_THEME_NAME = 'Follow the color scheme' // Tabby 内置默认主题名

                interface OverrideSpec {
                    section: 'appearance'|'terminal'|null
                    key: string
                    value: any
                    /** true = changed$ 守约 (开启期间被改动即重置, 用户在 Glass 世界不可改) */
                    guarded?: boolean
                }
                const OVERRIDES: OverrideSpec[] = [
                    // --- 守约组: 主题选择 + 与玻璃显示直接冲突的 8 项 ---
                    { section: 'appearance', key: 'theme', value: GLASS_THEME_NAME, guarded: true },
                    { section: 'appearance', key: 'tabsLocation', value: 'top', guarded: true },  // 侧/底 tab 栏布局与主题 CSS 不兼容
                    { section: 'appearance', key: 'frame', value: 'thin', guarded: true },        // native 需重启; full 额外插入 title-bar
                    { section: 'appearance', key: 'flexTabs', value: false, guarded: true },      // true 时 tab 宽度走动画内联样式, 压不住
                    { section: 'appearance', key: 'opacity', value: 0.93, guarded: true },        // 主题默认 (wezterm M.opacity)
                    { section: 'appearance', key: 'vibrancy', value: false, guarded: true },      // 系统亚克力与窗内壁纸是双背景体系
                    { section: 'appearance', key: 'dock', value: 'off', guarded: true },          // 停靠改变窗口几何并触发 title-bar
                    { section: 'terminal', key: 'background', value: 'theme', guarded: true },    // 'colorScheme' 会让终端背景糊死壁纸
                    { section: null, key: 'showProfileTree', value: false, guarded: true },       // 侧栏打破 tab 栏通栏假设
                    // --- 迁移组: 开启时一次性接管为 Glass 偏好 (开启期间可自由改, 关闭时还原) ---
                    { section: 'terminal', key: 'colorScheme', value: undefined },
                    { section: 'terminal', key: 'font', value: 'Cascadia Code' },
                    { section: 'terminal', key: 'fallbackFont', value: 'JetBrainsMono NF' },
                    { section: 'terminal', key: 'frontend', value: 'xterm' },      // Canvas 前端: 避免 WebGL 字形图集二次采样晕边
                    { section: 'terminal', key: 'showTabProfileIcon', value: true },
                    { section: 'terminal', key: 'hideTabIndex', value: true },     // wezterm: show_tab_index_in_tab_bar = false
                ]
                // colorScheme 是对象值, 在此赋 (IR_BLACK 定义在模块级)
                OVERRIDES.find(o => o.key === 'colorScheme')!.value = { __nonStructural: true, ...IR_BLACK }

                const rawValue = (spec: OverrideSpec): any => {
                    const raw = (config as any)._store
                    return spec.section ? raw?.[spec.section]?.[spec.key] : raw?.[spec.key]
                }
                // store 视图值: 经 proxy get 读取 (real 无值时自动回退 defaults) —— 与组件实际读到的
                // 完全一致. 守约必须用它比较: ConfigProxy 的 set 对 deepEqual 默认值的写入会从 _store
                // 删键 (raw 变回 undefined), 若按 raw 比较则锁定值==默认值的键会永远判定 drift,
                // 与 changed$ 形成 save 死循环 (打开设置页时卡死的根因).
                const storeValue = (spec: OverrideSpec): any => {
                    return spec.section ? config.store[spec.section][spec.key] : (config.store as any)[spec.key]
                }
                const writeValue = (spec: OverrideSpec, value: any): void => {
                    if (spec.section) {
                        config.store[spec.section][spec.key] = value
                    } else {
                        ;(config.store as any)[spec.key] = value
                    }
                }
                const sameValue = (a: any, b: any): boolean => {
                    if (a === b) { return true }
                    if (typeof a === 'object' && typeof b === 'object' && a && b) {
                        return JSON.stringify(a) === JSON.stringify(b)
                    }
                    return false
                }

                const isThemeEnabled = () => (config as any)._store?.glass?.themeEnabled !== false
                const hasBackup = () => {
                    const b = (config as any)._store?.glass?.lockBackup
                    return !!b && Object.keys(b).length > 0
                }

                // 开启: 快照用户世界 (theme 原值若已是 Glass → 映射默认主题, 保证"关"能退出 Glass)
                //       → 全量写 Glass 世界值 → 快照持久化
                const enableTheme = () => {
                    console.log('[glass] enableTheme: start')
                    const backup: any = {}
                    for (const spec of OVERRIDES) {
                        const id = (spec.section ?? '_') + '.' + spec.key
                        let current = rawValue(spec)
                        if (spec.key === 'theme' && current === GLASS_THEME_NAME) {
                            current = FALLBACK_THEME_NAME
                        }
                        backup[id] = current
                        writeValue(spec, spec.value)
                    }
                    config.store.glass.lockBackup = backup
                    config.store.glass.themeEnabled = true
                    console.log('[glass] enableTheme: snapshot theme=' + backup['appearance.theme'] + ' keys=' + Object.keys(backup).length)
                    // OS 窗口不透明度是进程级副作用, setOpacity 定义在 tabby-electron 实现层
                    const hostWindow = injector.get(HostWindowService) as any
                    hostWindow.setOpacity?.(0.93)
                    config.save().then(
                        () => console.log('[glass] enableTheme: save done'),
                        e => console.log('[glass] enableTheme: SAVE REJECT', e),
                    )
                }

                // 关闭: 按快照还原 (undefined → 删除键恢复"未设置"态), 清除 CSS 旁路与视觉状态
                const disableTheme = () => {
                    console.log('[glass] disableTheme: start')
                    const backup: any = (config as any)._store?.glass?.lockBackup ?? {}
                    if (!backup || Object.keys(backup).length === 0) {
                        console.log('[glass] disableTheme: EMPTY BACKUP (快照缺失, 无法还原 theme/迁移键)')
                    }
                    for (const spec of OVERRIDES) {
                        const id = (spec.section ?? '_') + '.' + spec.key
                        const original = backup[id]
                        if (original === undefined) {
                            if (spec.section) {
                                delete (config as any)._store[spec.section][spec.key]
                            } else {
                                delete (config as any)._store[spec.key]
                            }
                        } else {
                            writeValue(spec, original)
                        }
                    }
                    config.store.glass.themeEnabled = false
                    config.store.glass.lockBackup = {}
                    const userOpacity = typeof backup['appearance.opacity'] === 'number' ? backup['appearance.opacity'] : 1
                    const hostWindow = injector.get(HostWindowService) as any
                    hostWindow.setOpacity?.(userOpacity)
                    config.save().then(
                        () => console.log('[glass] disableTheme: save done'),
                        e => console.log('[glass] disableTheme: SAVE REJECT', e),
                    )
                    // theme 还原后 changed$ 驱动 ThemesService 重新应用用户主题 CSS;
                    // glass-vars (壁纸变量) 由 applyGlassVars 按 isThemeEnabled 清空
                }

                // 锁定徽标: 在宿主设置页 (设置 → Window) 被锁项的标题旁注入 🔒
                // 锚点为 .title 文本关键词 (en 源文本 + zh-CN 常见译名), 语言不匹配时静默降级
                const LOCK_BADGE_TEXT_RE = /opacity|window frame|tabs location|tabs width|acrylic background|vibrancy|background type|profile sidebar|dock the terminal|不透明度|窗口边框|边框|标签页?位置|标签页?宽度|亚克力|模糊|背景类型|配置文件|个人资料|侧边栏|停靠/
                const injectLockBadges = () => {
                    const titles = document.querySelectorAll('settings-tab .header .title')
                    titles.forEach(t => {
                        const text = (t.textContent || '').trim()
                        if (!text || !LOCK_BADGE_TEXT_RE.test(text.toLowerCase()) || t.querySelector('.glass-lock-badge')) { return }
                        const badge = document.createElement('i')
                        badge.className = 'fas fa-lock glass-lock-badge'
                        badge.title = '已由 Glass 主题锁定 (Glass 设置页可关闭主题开关)'
                        t.appendChild(badge)
                    })
                }
                let lockBadgeObserver: MutationObserver|null = null
                let badgeObserverTimer: any = null
                const startLockBadgeObserver = () => {
                    if (lockBadgeObserver) { return }
                    // 关键: observer 及其回调必须在 Angular zone 之外 ——
                    // 若在 zone 内, 设置页每次 CD 的 DOM 变化 → observer 回调(zone 任务)
                    // → onInvokeTask 触发 tick → tick 再改 DOM → observer …… CD 与 observer
                    // 无限共振, 主线程微任务饥饿 (Hotkeys 页卡死 + save() 永不 resolve 的根因)
                    let zone: any
                    try { zone = injector.get(NgZone) } catch { zone = null }
                    const scheduleInject = () => {
                        // 双保险: 节流 (200ms trailing), 高频 DOM 变化下每拍最多注入一次
                        if (badgeObserverTimer !== null) { return }
                        badgeObserverTimer = setTimeout(() => {
                            badgeObserverTimer = null
                            // settings-tab 不在 DOM 时短路, 避免终端输出的高频 DOM 突变空转
                            if (!document.querySelector('settings-tab')) { return }
                            injectLockBadges()
                        }, 200)
                    }
                    const start = () => {
                        if (lockBadgeObserver) { return }
                        lockBadgeObserver = new MutationObserver(scheduleInject)
                        lockBadgeObserver.observe(document.body, { childList: true, subtree: true })
                        injectLockBadges()
                    }
                    if (zone?.runOutsideAngular) {
                        zone.runOutsideAngular(start)
                    } else {
                        start()
                    }
                }
                const stopLockBadgeObserver = () => {
                    if (badgeObserverTimer !== null) {
                        clearTimeout(badgeObserverTimer)
                        badgeObserverTimer = null
                    }
                    lockBadgeObserver?.disconnect()
                    lockBadgeObserver = null
                    document.querySelectorAll('.glass-lock-badge').forEach(el => el.remove())
                }

                const setEnabledVisualState = (on: boolean) => {
                    document.documentElement.classList.toggle('glass-locked', on)
                    if (on) {
                        startLockBadgeObserver()
                    } else {
                        stopLockBadgeObserver()
                    }
                }

                const setThemeEnabled = (on: boolean) => {
                    if (on) {
                        enableTheme()
                    } else {
                        disableTheme()
                    }
                    setEnabledVisualState(on)
                    applyGlassVars()
                    // save() 已在 enable/disable 内调用, changed$ 驱动 ThemesService 重应用主题 CSS
                    // 及 vibrancy/opacity/WCO 等副作用链
                    try {
                        injector.get(ApplicationRef).tick()
                    } catch { /* ApplicationRef 不可用时跳过 (模板绑定由 changed$ 链路兜底刷新) */ }
                }

                // 启动初始化:
                //  - 开关开 + 无快照 → 首次接管 (建快照, 补齐 Glass 值)
                //  - 开关关 + 有快照 → 上次未正常关闭 (崩溃/强杀) → 自愈还原
                //  - 开关开 + 有快照 → 状态已在配置中, 仅对齐视觉状态
                console.log('[glass] init: themeEnabled=' + isThemeEnabled() + ' hasBackup=' + hasBackup())
                if (isThemeEnabled() && !hasBackup()) {
                    enableTheme()
                }
                if (!isThemeEnabled() && hasBackup()) {
                    disableTheme()
                }
                setEnabledVisualState(isThemeEnabled())
                applyGlassVars()

                // 诊断接口: Console 可直测 save() / 手动刷新变量 / 切换主题总开关
                ;(window as any).__glassConfig = config
                ;(window as any).__glassRefresh = applyGlassVars
                ;(window as any).__glassSetTheme = (on: boolean) => setThemeEnabled(on)

                // changed$ 分发链可能被前方订阅者的异常中断, 故:
                // 1) 设置页走 __glassRefresh 直调 (glassSettingsTab.save)
                // 2) 此处订阅做双保险 (守约重放 + 变量同步)
                config.changed$.subscribe(() => {
                    applyGlassVars()
                    // 守约: 开启期间 guarded 组被外部改动 (其他窗口/直改配置文件) → 重写 Glass 值
                    if (isThemeEnabled()) {
                        let drifted = false
                        for (const spec of OVERRIDES) {
                            if (spec.guarded && !sameValue(storeValue(spec), spec.value)) {
                                console.log('[glass] guard drift: ' + (spec.section ?? '_') + '.' + spec.key + ' -> ' + JSON.stringify(spec.value))
                                writeValue(spec, spec.value)
                                drifted = true
                            }
                        }
                        if (drifted) {
                            config.save().then(
                                () => console.log('[glass] guard: save done'),
                                e => console.log('[glass] guard: SAVE REJECT', e),
                            )
                        }
                        setEnabledVisualState(true)
                    }
                })

                // 快捷键: 切换背景图开关 (Ctrl-Alt-B, 可在 设置 → 热键 修改)
                injector.get(HotkeysService).hotkey$.subscribe(hotkey => {
                    if (hotkey === 'glass-toggle-wallpaper') {
                        config.store.glass.wallpaperEnabled = config.store.glass.wallpaperEnabled === false
                        config.save()
                    }
                })
            })
        })
    }
}

@NgModule({
    declarations: [
        GlassSettingsTabComponent,
    ],
    providers: [
        // 注意: 必须用 useClass 而非官方模板的 useExisting ——
        // useExisting 指向未单独注册的 token 会在引导期抛 NullInjectorError,
        // 导致整个 Angular 应用引导失败 (所有用户插件一起消失)
        { provide: Theme, useClass: GlassTheme, multi: true },
        { provide: ConfigProvider, useClass: GlassConfigProvider, multi: true },
        { provide: TerminalColorSchemeProvider, useClass: GlassColorSchemes, multi: true },
        { provide: SettingsTabProvider, useClass: GlassSettingsTabProvider, multi: true },
        { provide: HotkeyProvider, useClass: GlassHotkeyProvider, multi: true },
    ],
})
export default class GlassThemeModule { } // eslint-disable-line @typescript-eslint/no-extraneous-class
