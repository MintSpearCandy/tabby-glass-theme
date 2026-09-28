import { NgModule, Injectable, Injector } from '@angular/core'
import { Theme, ConfigProvider, ConfigService, HostWindowService, HotkeysService, HotkeyProvider, HotkeyDescription } from 'tabby-core'
import { TerminalColorSchemeProvider } from 'tabby-terminal'
import { SettingsTabProvider } from 'tabby-settings'

import { GlassSettingsTabProvider } from './glassSettings'
import { GlassSettingsTabComponent } from './glassSettingsTab.component'
import { GlassSwitchEngine, OverrideSpec, TRANSPARENT_BG } from './engine'

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
 */
@Injectable()
class GlassTheme extends Theme {
    name = 'Glass'
    css = require('./theme.scss')
    terminalBackground = '#00000000'
}

/**
 * IR_Black 配色方案 (wezterm colors.lua 同源)
 * 背景带 alpha → xterm canvas 透明, 壁纸透出 (字段级接管详见 engine.ts)
 */
const IR_BLACK: TerminalColorScheme = {
    name: 'IR_Black',
    foreground: '#f8f8f8',
    background: TRANSPARENT_BG,
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
 * 配置提供者: 只声明 defaults (glass 段的键才有 proxy 访问器);
 * 接管/还原逻辑全部在 GlassSwitchEngine (engine.ts), 此处仅做接线.
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
            themeEnabled: true,
            // __nonStructural: 允许整对象赋值经 proxy 写入 _store (结构性子对象只有 getter)
            lockBackup: { __nonStructural: true },
            userSchemeBg: { __nonStructural: true },
        },
    }

    constructor (injector: Injector) {
        super()
        // 必须延迟解析: 本 provider 在 ConfigService 构造期间被实例化,
        // 同步 injector.get(ConfigService) 会形成 DI 环 (NG0200) 炸掉整个引导.
        setTimeout(() => {
            const config = injector.get(ConfigService)
            config.ready$.subscribe(() => {
                // 锁定/迁移表 (IR_BLACK 为 colorScheme 的接管默认值)
                const overrides: OverrideSpec[] = [
                    // 守约组: 与玻璃显示直接冲突的项 (开启期间锁定)
                    { section: 'appearance', key: 'tabsLocation', value: 'top', guarded: true },
                    { section: 'appearance', key: 'frame', value: 'thin', guarded: true },
                    { section: 'appearance', key: 'flexTabs', value: false, guarded: true },
                    { section: 'appearance', key: 'opacity', value: 0.93, guarded: true },
                    { section: 'appearance', key: 'vibrancy', value: false, guarded: true },
                    { section: 'appearance', key: 'dock', value: 'off', guarded: true },
                    { section: 'terminal', key: 'background', value: 'colorScheme', guarded: true },
                    { section: null, key: 'showProfileTree', value: false, guarded: true },
                    // 迁移组: 开启时补默认 (用户显式值优先), 关闭时按快照还原
                    { section: 'terminal', key: 'colorScheme', value: { __nonStructural: true, ...IR_BLACK } },
                    { section: 'terminal', key: 'font', value: 'Cascadia Code' },
                    { section: 'terminal', key: 'fallbackFont', value: 'JetBrainsMono NF' },
                    { section: 'terminal', key: 'frontend', value: 'xterm' },
                    { section: 'terminal', key: 'showTabProfileIcon', value: true },
                    { section: 'terminal', key: 'hideTabIndex', value: true },
                ]

                const engine = new GlassSwitchEngine(injector)
                engine.overrides = overrides
                engine.boot()
                config.changed$.subscribe(() => engine.onConfigChanged())

                // 诊断接口: Console 可直测 save()/刷新变量/切换总开关/默认壁纸路径
                ;(window as any).__glassConfig = config
                ;(window as any).__glassRefresh = () => engine.refreshVisuals()
                ;(window as any).__glassSetTheme = (on: boolean) => engine.set(on)
                ;(window as any).__glassDefaultWallpaper = () => engine.defaultWallpaper()

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
