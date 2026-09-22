/**
 * 迁移链纯逻辑复现: 用 tabby-core ConfigProxy 同款语义 + 主 config 真实数据重放迁移
 * node scripts/replayMigration.js
 */
const fs = require('fs')
const yaml = require('js-yaml')
const deepClone = require('clone-deep')
const deepEqual = require('deep-equal')

// ===== 从 tabby-core/src/services/config.service.ts 抄录的核心语义 =====
function isStructuralMember (v) {
    return v instanceof Object && !(v instanceof Array) &&
        Object.keys(v).length > 0 && !v.__nonStructural
}
function isNonStructuralObjectMember (v) {
    return v instanceof Object && (v instanceof Array || v.__nonStructural)
}

class ConfigProxy {
    constructor (real, defaults) {
        for (const key in defaults) {
            if (isStructuralMember(defaults[key])) {
                if (!real[key]) { real[key] = {} }
                const proxy = new ConfigProxy(real[key], defaults[key])
                Object.defineProperty(this, key, { enumerable: true, configurable: false, get: () => proxy })
            } else {
                Object.defineProperty(this, key, {
                    enumerable: true, configurable: false,
                    get: () => this.__getValue(key),
                    set: (value) => { this.__setValue(key, value) },
                })
            }
        }
        this.__real = real
        this.__defaults = defaults
        this.__getValue = (key) => {
            if (real[key] !== undefined) { return real[key] }
            if (isNonStructuralObjectMember(defaults[key])) {
                real[key] = this.__getDefault(key)
                delete real[key].__nonStructural
            }
            return real[key] !== undefined ? real[key] : this.__getDefault(key)
        }
        this.__getDefault = (key) => deepClone(defaults[key])
        this.__setValue = (key, value) => {
            if (deepEqual(value, this.__getDefault(key))) {
                delete real[key]
            } else {
                real[key] = value
            }
        }
    }
}

// ===== defaults 树: 合并方向按实测 (内置在末位覆盖插件), 但迁移只读不写 defaults, 直接手工构造 =====
const IR_BLACK = {
    name: 'IR_Black', foreground: '#f1f1f1', background: '#000000', cursor: '#808080',
    cursorAccent: '#000000', selection: 'rgba(255, 255, 255, 0.15)', selectionForeground: '#9e9e9e',
    colors: ['#4f4f4f', '#fa6c60', '#a8ff60', '#fffeb7', '#96cafe', '#fa73fd', '#c6c5fe', '#efedef',
             '#7b7b7b', '#fcb6b0', '#cfffab', '#ffffcc', '#b5dcff', '#fb9cfe', '#e0e0fe', '#ffffff'],
}
const defaults = {
    appearance: {
        dock: 'off', dockScreen: 'current', dockFill: 0.5, dockSpace: 1, dockHideOnBlur: false,
        dockAlwaysOnTop: true, flexTabs: false, tabsLocation: 'top', tabsInFullscreen: false,
        cycleTabs: true, theme: 'Follow the color scheme', frame: 'thin',
        css: '', opacity: 1.0, vibrancy: false, vibrancyType: 'blur',
        lastTabClosesWindow: false, spaciness: 1, colorSchemeMode: 'dark',
    },
    terminal: {
        frontend: 'xterm-webgl', fontSize: 14, fontWeight: 400, fontWeightBold: 700,
        fallbackFont: null, linePadding: 0, bell: 'off', bracketedPaste: true,
        background: 'theme', ligatures: false, cursor: 'block', cursorBlink: true,
        hideTabIndex: false, showTabProfileIcon: false, hideCloseButton: false,
        hideTabOptionsButton: false, rightClick: 'menu', pasteOnMiddleClick: false,
        copyOnSelect: true, copyAsHTML: true, scrollOnInput: true, altIsMeta: false,
        wordSeparator: ' ()[]{}\'"', customColorSchemes: [], warnOnMultilinePaste: true,
        searchRegexAlwaysEnabled: false, searchOptions: { regex: false, wholeWord: false, caseSensitive: false },
        detectProgress: true, scrollbackLines: 25000, drawBoldTextInBrightColors: true,
        sixel: true, minimumContrastRatio: 4, paletteGenerate: false, paletteHarmonious: false,
        replaceNewlinesWithSpacesOnPaste: false, trimWhitespaceOnPaste: true,
        font: 'Consolas',
        colorScheme: { __nonStructural: true, name: 'Tabby Default', foreground: '#cacaca', background: '#171717', cursor: '#bbbbbb', colors: ['#000000', '#ff615a', '#b1e969', '#ebd99c', '#5da9f6', '#e86aff', '#82fff7', '#dedacf', '#313131', '#f58c80', '#ddf88f', '#eee5b2', '#a5c7ff', '#ddaaff', '#b7fff9', '#ffffff'] },
    },
    glass: {
        wallpaper: 'D:/App/Tabby/resources/ac041_void棺材胡桃4k.jpg',
        wallpaperEnabled: true, wallpaperOpacity: 0.7, overlayTop: 0.5, overlayBottom: 0.78,
    },
}

// ===== 主 config 真实数据 =====
const store = yaml.load(fs.readFileSync('D:/App/Tabby/data/config.yaml', 'utf8'))
console.log('主 config 顶层键:', Object.keys(store).join(', '))

const proxy = new ConfigProxy(store, defaults)

// ===== 重放迁移链 (与 index.ts 完全同序) =====
const raw = store
try {
    if (raw?.appearance?.opacity === undefined) {
        proxy.appearance.opacity = 0.93
        console.log('✓ opacity 迁移')
    }
    if (raw?.terminal?.colorScheme === undefined) {
        proxy.terminal.colorScheme = { __nonStructural: true, ...deepClone(IR_BLACK) }
        console.log('✓ colorScheme 迁移')
    }
    if (raw?.terminal?.font === undefined) {
        proxy.terminal.font = 'Cascadia Code'
        proxy.terminal.fallbackFont = 'JetBrainsMono NF'
        console.log('✓ font 迁移')
    }
    if (raw?.terminal?.frontend === undefined) {
        proxy.terminal.frontend = 'xterm'
        console.log('✓ frontend 迁移')
    }
    if (raw?.terminal?.showTabProfileIcon === undefined) {
        proxy.terminal.showTabProfileIcon = true
        console.log('✓ showTabProfileIcon 迁移')
    }
    if (raw?.terminal?.hideTabIndex === undefined) {
        proxy.terminal.hideTabIndex = true
        console.log('✓ hideTabIndex 迁移')
    }
    // applyGlassVars 等价读取
    const g = proxy.glass
    console.log('✓ glass 读取:', JSON.stringify({ wallpaper: g.wallpaper, enabled: g.wallpaperEnabled, op: g.wallpaperOpacity }))
    console.log('--- 全链重放完成, 无异常 ---')
} catch (e) {
    console.log('✗ 抛错:', e.stack.split('\n').slice(0, 5).join('\n'))
}
// 迁移后的 real 状态 (等价于 save 序列化会落盘的内容)
console.log('迁移后 real.terminal 键:', Object.keys(store.terminal || {}))
console.log('迁移后 real.appearance 键:', Object.keys(store.appearance || {}))
