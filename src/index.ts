import { NgModule, Injectable, Injector } from '@angular/core'
import { Theme, ConfigProvider, ConfigService, HotkeysService, HotkeyProvider, HotkeyDescription, BOOTSTRAP_DATA } from 'tabby-core'
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
 * 深色玻璃质感主题 —— 常规 Tabby 主题 (设置 → 外观 → 主题 选择 Glass).
 * 不接管/锁定/回撤任何宿主配置; 终端透明走原生 Theme.terminalBackground,
 * 主题 CSS/变量全部由 ThemesService 原生链路管理.
 */
@Injectable()
class GlassTheme extends Theme {
    name = 'Glass'
    css = require('./theme.scss')
    // 终端视口全透明, 露出主题 CSS 的壁纸+渐变图层 (xterm allowTransparency 恒开)
    terminalBackground = '#00000000'
}

/**
 * IR_Black 配色方案 (wezterm colors.lua 同源), 作为常规注册配色供用户选择.
 */
const IR_BLACK: TerminalColorScheme = {
    name: 'IR_Black',
    foreground: '#f8f8f8',
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

/** 声明快捷键 (默认键位由 defaults.hotkeys 提供, 设置 → 热键 可改) */
@Injectable()
class GlassHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            { id: 'glass-toggle-wallpaper', name: 'Glass: 切换背景图' },
        ]
    }
}

/**
 * 配置提供者: defaults 只声明 glass 段键; ready$ 后做两件事:
 *  1. 旧"总开关"方案 (v0.3.x 配置接管) 的一次性清理迁移 —— 按快照还原被接管的
 *     配置, 移除所有接管标记键, 幂等;
 *  2. 壁纸 CSS 变量旁路注入 (自有 <style id="glass-vars">, 不碰宿主任何链路).
 */
@Injectable()
class GlassConfigProvider extends ConfigProvider {
    defaults = {
        hotkeys: {
            'glass-toggle-wallpaper': ['Ctrl-Alt-B'],
        },
        glass: {
            wallpaper: '',
            wallpaperEnabled: true,
            wallpaperOpacity: 0.7,
            overlayTop: 0.5,
            overlayBottom: 0.78,
        },
    }

    constructor (injector: Injector) {
        super()
        // 必须延迟解析: 本 provider 在 ConfigService 构造期间被实例化,
        // 同步 injector.get(ConfigService) 会形成 DI 环 (NG0200) 炸掉整个引导.
        setTimeout(() => {
            const config = injector.get(ConfigService)
            config.ready$.subscribe(() => {
                const raw = (config as any)._store

                // ---- 一次性清理: 旧总开关方案的接管残留 (幂等) ----
                const backup = raw?.glass?.lockBackup
                if (backup && Object.keys(backup).length > 0) {
                    // 按快照还原被接管键 (undefined → 删键 = "未设置"态)
                    for (const id of Object.keys(backup)) {
                        const [section, key] = id.split('.')
                        const original = backup[id]
                        try {
                            if (original === undefined) {
                                if (section === '_') { delete raw[key] } else if (raw[section]) { delete raw[section][key] }
                            } else if (section === '_') {
                                ;(config.store as any)[key] = original
                            } else if (raw[section]) {
                                config.store[section][key] = original
                            }
                        } catch (e) {
                            console.log('[glass] cleanup skip ' + id, e)
                        }
                    }
                }
                // colorScheme 若残留透明背景 (接管期写入), 恢复为常规不透明黑
                const cs = raw?.terminal?.colorScheme
                if (cs && typeof cs.background === 'string' && /,\s*0\)$|00000000$|^transparent$/i.test(cs.background)) {
                    console.log('[glass] cleanup: restore opaque scheme background')
                    config.store.terminal.colorScheme = { __nonStructural: true, ...cs, background: '#000000' }
                }
                // 移除接管标记键 (defaults 已无声明, 残留仅为 yaml 数据)
                if (raw?.glass) {
                    delete raw.glass.themeEnabled
                    delete raw.glass.lockBackup
                    delete raw.glass.userSchemeBg
                }

                // ---- 壁纸 CSS 变量旁路 (本主题唯一的运行时注入) ----
                let cachedDataDir: string | null = null
                const defaultWallpaper = (): string => {
                    if (cachedDataDir !== null) { return cachedDataDir + '/resources/background.jpg' }
                    try {
                        const bp: any = injector.get(BOOTSTRAP_DATA)
                        const p: string|undefined = bp?.userPluginsPath
                        if (typeof p === 'string' && p.length > 0) {
                            cachedDataDir = p.replace(/[\\/](plugins|node_modules)([\\/].*)?$/i, '').replace(/\\/g, '/')
                            return cachedDataDir + '/resources/background.jpg'
                        }
                    } catch { /* 不可用时无壁纸 */ }
                    cachedDataDir = ''
                    return ''
                }

                const applyGlassVars = () => {
                    const g = config.store.glass ?? {}
                    let styleEl = document.querySelector('style#glass-vars') as HTMLStyleElement | null
                    if (!styleEl) {
                        styleEl = document.createElement('style')
                        styleEl.id = 'glass-vars'
                        document.head.appendChild(styleEl)
                    }
                    // 留空 = 默认图 (<userData>/resources/background.jpg); 显式路径优先.
                    // 协议判定必须含 '//' —— 单字母盘符 'D:' 会被 '^[a-z]+:' 误判为协议
                    const wp: string = g.wallpaper || defaultWallpaper()
                    const enabled = g.wallpaperEnabled !== false
                    let imageValue = 'none'
                    if (wp && enabled) {
                        const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(wp) ? wp : 'file:///' + wp.replace(/\\/g, '/')
                        imageValue = `url("${url}")`
                    }
                    styleEl.textContent = `:root{--glass-wallpaper-image:${imageValue};` +
                        `--glass-wallpaper-opacity:${g.wallpaperOpacity ?? 0.7};` +
                        `--glass-overlay-top:${g.overlayTop ?? 0.5};` +
                        `--glass-overlay-bottom:${g.overlayBottom ?? 0.78}}`
                }
                applyGlassVars()

                // 诊断接口
                ;(window as any).__glassConfig = config
                ;(window as any).__glassRefresh = applyGlassVars
                ;(window as any).__glassDefaultWallpaper = defaultWallpaper

                // changed$ 分发链可能被前方订阅者异常中断, 故:
                // 1) 设置页走 __glassRefresh 直调
                // 2) 此处订阅做双保险
                config.changed$.subscribe(() => applyGlassVars())

                // 快捷键: 切换背景图开关 (Ctrl-Alt-B)
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
        // 注意: 必须用 useClass 而非官方模板的 useExisting —— useExisting 指向
        // 未单独注册的 token 会抛 NullInjectorError 炸掉整个 Angular 引导
        { provide: Theme, useClass: GlassTheme, multi: true },
        { provide: ConfigProvider, useClass: GlassConfigProvider, multi: true },
        { provide: TerminalColorSchemeProvider, useClass: GlassColorSchemes, multi: true },
        { provide: SettingsTabProvider, useClass: GlassSettingsTabProvider, multi: true },
        { provide: HotkeyProvider, useClass: GlassHotkeyProvider, multi: true },
    ],
})
export default class GlassThemeModule { } // eslint-disable-line @typescript-eslint/no-extraneous-class
