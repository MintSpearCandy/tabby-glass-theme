import { NgModule, Injectable, Injector } from '@angular/core'
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

                // 迁移: 幂等 (raw 中已有用户显式值的键跳过), 每次配置变化后重放 ——
                // 多窗口 config 写竞争 (broadcast → load() 重建 _store) 也不会丢迁移键
                // 窗口副作用 (setOpacity) 例外: OS 窗口不透明度是进程级状态, 本会话一次即可,
                // 随迁移重放重复调会在窗口销毁后命中主进程 handler 的空指针 (上游 window.ts 无 null 检查)
                let opacitySideEffectApplied = false
                const applyMigrations = () => {
                    const raw = (config as any)._store
                    if (raw?.appearance?.opacity === undefined) {
                        config.store.appearance.opacity = 0.93
                        // setOpacity 定义在 tabby-electron 实现层 (core 抽象类未声明), Web 平台无此方法
                        if (!opacitySideEffectApplied) {
                            opacitySideEffectApplied = true
                            const hostWindow = injector.get(HostWindowService) as any
                            hostWindow.setOpacity?.(0.93)
                        }
                    }
                    if (raw?.terminal?.colorScheme === undefined) {
                        config.store.terminal.colorScheme = { __nonStructural: true, ...IR_BLACK }
                    }
                    if (raw?.terminal?.font === undefined) {
                        config.store.terminal.font = 'Cascadia Code'
                        config.store.terminal.fallbackFont = 'JetBrainsMono NF'
                    }
                    if (raw?.terminal?.frontend === undefined) {
                        // Canvas 前端替代 WebGL: 避免 WebGL 字形图集的二次线性采样
                        // 造成的半像素晕边 (灰度 AA 晕边本身来自 Chromium canvas 光栅化, CSS 无法干预)
                        config.store.terminal.frontend = 'xterm'
                    }
                    if (raw?.terminal?.showTabProfileIcon === undefined) {
                        // tab 标题左侧显示连接类型图标
                        config.store.terminal.showTabProfileIcon = true
                    }
                    if (raw?.terminal?.hideTabIndex === undefined) {
                        // 默认不渲染 tab 序号 (wezterm: show_tab_index_in_tab_bar = false)
                        config.store.terminal.hideTabIndex = true
                    }
                }
                applyMigrations()
                applyGlassVars()

                // 诊断接口: Console 可直测 save() / 手动刷新变量
                ;(window as any).__glassConfig = config
                ;(window as any).__glassRefresh = applyGlassVars

                // changed$ 分发链可能被前方订阅者的异常中断, 故:
                // 1) 设置页走 __glassRefresh 直调 (glassSettingsTab.save)
                // 2) 此处订阅做双保险 (迁移幂等重放 + 变量同步)
                config.changed$.subscribe(() => {
                    applyMigrations()
                    applyGlassVars()
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
