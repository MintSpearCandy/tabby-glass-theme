import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'

/**
 * 微软风格纯色配色组 —— Windows 11 个性化色板同源 (强调色系 + 深色桌面色).
 */
const MS_PALETTE = [
    '#0078D4', // Windows 蓝 (默认)
    '#0099BC', // 深青
    '#00B7C3', // 青
    '#038387', // 暗青
    '#00B294', // 海泡绿
    '#107C10', // 绿
    '#498205', // 蔬菜绿
    '#8CBD18', // 青柠
    '#C19C00', // 金
    '#FFB900', // 黄
    '#EF6950', // 珊瑚
    '#E81123', // 红
    '#EA005E', // 品红
    '#C239B3', // 紫
    '#8764B8', // 鸢尾紫
    '#744DA9', // 堇紫
    '#6B69D6', // 靛蓝
    '#4A5459', // 钢灰
    '#767676', // 灰
    '#4C4A48', // 深灰
    '#202020', // Win11 深色桌面
]

const DEFAULT_SOLID = '#0078D4'
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/

/**
 * Glass 主题设置页 (设置 → Glass Theme)
 * 所有改动经 config.store.glass.* 写入 → save() → changed$ → CSS 变量即时生效
 */
@Component({
    template: `
        <div class="content-box glass-settings">
            <h3>Glass Theme</h3>

            <div class="form-line">
                <div class="header">
                    <div class="title">背景</div>
                    <div class="description">
                        图片或纯色背景, 配合遮罩与不透明度; 热键 Ctrl+Alt+B 快速开关
                    </div>
                </div>
                <div class="form-check form-switch glass-settings-inline-switch">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="glassWallpaperEnabled"
                        [checked]="glass.wallpaperEnabled !== false"
                        (change)="setEnabled($event)"
                    >
                    <label class="form-check-label" for="glassWallpaperEnabled">显示背景</label>
                </div>
            </div>

            <div class="form-line">
                <div class="header">
                    <div class="title">背景类型</div>
                    <div class="description">纯色同样支持不透明度与遮罩调节</div>
                </div>
                <div class="btn-group">
                    <button
                        class="btn btn-sm"
                        [class.btn-primary]="mode !== 'solid'"
                        [class.btn-secondary]="mode === 'solid'"
                        (click)="setMode('image')"
                    >图片</button>
                    <button
                        class="btn btn-sm"
                        [class.btn-primary]="mode === 'solid'"
                        [class.btn-secondary]="mode !== 'solid'"
                        (click)="setMode('solid')"
                    >纯色</button>
                </div>
            </div>

                <!-- 图片背景: 路径独占一行, 右侧文件浏览 -->
                <div class="glass-bg-block" *ngIf="mode !== 'solid'">
                    <div class="input-group glass-bg-path">
                        <input
                            type="text"
                            class="form-control"
                            [value]="glass.wallpaper ?? ''"
                            (change)="setWallpaper($event)"
                            [placeholder]="defaultWallpaper"
                        >
                        <button
                            class="btn btn-secondary"
                            (click)="browseWallpaper()"
                            [disabled]="!canBrowse"
                            title="浏览本地图片"
                        >浏览…</button>
                    </div>
                    <div class="glass-bg-hint">
                        支持相对路径 (相对配置目录), http(s):// 或 file:/// URL 与本地绝对路径;
                        留空使用默认图片
                    </div>
                </div>

                <!-- 纯色背景: 配色组色板 + 自定义调色盘 -->
                <div class="glass-bg-block" *ngIf="mode === 'solid'">
                    <div class="glass-swatch-grid">
                        <button
                            *ngFor="let c of palette"
                            type="button"
                            class="glass-swatch"
                            [style.background]="c"
                            [class.active]="isActiveColor(c)"
                            [title]="c"
                            (click)="setSolidColor(c)"
                        ></button>
                    </div>
                    <div class="input-group glass-color-inputs">
                        <input
                            type="color"
                            class="form-control form-control-color"
                            [value]="pickerColor"
                            (input)="setColorPicker($event)"
                            title="自定义颜色"
                        >
                        <input
                            type="text"
                            class="form-control"
                            [value]="glass.solidColor ?? DEFAULT_SOLID"
                            (change)="setSolidColorManual($event)"
                            placeholder="#RRGGBB"
                        >
                    </div>
                    <div class="glass-bg-hint">点击色板选用配色组颜色, 或用调色盘自定任意颜色</div>
                </div>

            <div class="form-line">
                <div class="header">
                    <div class="title"><span>背景不透明度</span><span class="glass-value">{{ glass.wallpaperOpacity ?? 0.7 }}</span></div>
                    <div class="description">背景与深色底的混合强度, 越低背景越暗 (图片与纯色通用)</div>
                </div>
                <input
                    type="range"
                    class="form-range"
                    min="0"
                    max="1"
                    step="0.05"
                    [value]="glass.wallpaperOpacity ?? 0.7"
                    (input)="setNumber('wallpaperOpacity', $event)"
                >
            </div>

            <div class="form-line">
                <div class="header">
                    <div class="title"><span>顶部遮罩</span><span class="glass-value">{{ glass.overlayTop ?? 0.5 }}</span></div>
                    <div class="description">窗口顶部 (标签栏一侧) 的暗化程度</div>
                </div>
                <input
                    type="range"
                    class="form-range"
                    min="0"
                    max="1"
                    step="0.02"
                    [value]="glass.overlayTop ?? 0.5"
                    (input)="setNumber('overlayTop', $event)"
                >
            </div>

            <div class="form-line">
                <div class="header">
                    <div class="title"><span>底部遮罩</span><span class="glass-value">{{ glass.overlayBottom ?? 0.78 }}</span></div>
                    <div class="description">窗口底部的暗化程度, 增强终端文字可读性</div>
                </div>
                <input
                    type="range"
                    class="form-range"
                    min="0"
                    max="1"
                    step="0.02"
                    [value]="glass.overlayBottom ?? 0.78"
                    (input)="setNumber('overlayBottom', $event)"
                >
            </div>

            <div class="form-line glass-settings-actions">
                <button class="btn btn-secondary" (click)="resetDefaults()">恢复默认值</button>
            </div>
        </div>
    `,
    styles: [`
        .glass-settings .glass-bg-block { padding: 2px 0 14px; }
        .glass-settings .glass-bg-path input { min-width: 0; }
        .glass-settings .glass-bg-hint {
            font-size: 13px; opacity: .5; margin-top: 6px;
        }
        .glass-settings .glass-swatch-grid {
            display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;
        }
        .glass-settings .glass-swatch {
            width: 28px; height: 28px; border-radius: 6px;
            border: 2px solid rgba(255, 255, 255, .15);
            cursor: pointer; padding: 0;
        }
        .glass-settings .glass-swatch:hover { border-color: rgba(255, 255, 255, .5); }
        .glass-settings .glass-swatch.active {
            border-color: #fff;
            box-shadow: 0 0 0 2px rgba(0, 120, 212, .8);
        }
        .glass-settings .glass-color-inputs { width: 13rem; }
        .glass-settings .glass-color-inputs input[type=color] {
            flex: 0 0 3rem; padding: 2px; cursor: pointer;
        }
        .glass-settings .glass-settings-inline-switch { white-space: nowrap; }
    `],
})
export class GlassSettingsTabComponent {
    readonly palette = MS_PALETTE
    readonly DEFAULT_SOLID = DEFAULT_SOLID
    private saveTimer: any = null
    /** 文件浏览是否可用 (取决于 @electron/remote 能否从宿主解析) */
    canBrowse = false

    constructor (
        public config: ConfigService,
    ) {
        try {
            require('@electron/remote')
            this.canBrowse = true
        } catch { /* 宿主未提供: 浏览按钮禁用, 手输路径不受影响 */ }
    }

    get glass (): any {
        return this.config.store.glass
    }

    get mode (): string {
        return this.glass?.backgroundMode === 'solid' ? 'solid' : 'image'
    }

    /** 壁纸默认路径 (引擎侧同源解析, 见 index.ts) */
    get defaultWallpaper (): string {
        return (window as any).__glassDefaultWallpaper?.() ?? ''
    }

    /** input[type=color] 只吃 #RRGGBB; 8 位 hex/rgba 显示时剥掉 alpha */
    get pickerColor (): string {
        const c: string = this.glass?.solidColor ?? DEFAULT_SOLID
        return /^#[0-9a-fA-F]{6}$/.test(c) ? c : /^#[0-9a-fA-F]{8}$/.test(c) ? c.slice(0, 7) : DEFAULT_SOLID
    }

    isActiveColor (c: string): boolean {
        return (this.glass?.solidColor ?? '').toLowerCase() === c.toLowerCase()
    }

    setEnabled (event: Event): void {
        this.glass.wallpaperEnabled = (event.target as HTMLInputElement).checked
        this.save()
    }

    setMode (mode: 'image' | 'solid'): void {
        if (this.mode === mode) { return }
        this.glass.backgroundMode = mode
        this.save()
    }

    setWallpaper (event: Event): void {
        const value = (event.target as HTMLInputElement).value.trim()
        this.glass.wallpaper = value
        this.save()
    }

    /** 配色组色板选择 */
    setSolidColor (color: string): void {
        this.glass.solidColor = color
        this.save()
    }

    /** 调色盘 (input[type=color], 值恒为 #RRGGBB) */
    setColorPicker (event: Event): void {
        const value = (event.target as HTMLInputElement).value
        if (COLOR_RE.test(value)) {
            this.glass.solidColor = value
            this.save()
        }
    }

    /** 手输色值: #RGB/#RRGGBB/#RRGGBBAA/rgba() 均可, 非法输入忽略 */
    setSolidColorManual (event: Event): void {
        const value = (event.target as HTMLInputElement).value.trim()
        if (COLOR_RE.test(value)) {
            this.glass.solidColor = value
            this.save()
        } else {
            ;(event.target as HTMLInputElement).value = this.glass.solidColor ?? DEFAULT_SOLID
        }
    }

    /** 文件浏览: 选中配置目录内的文件存相对路径, 否则存绝对路径 */
    browseWallpaper (): void {
        try {
            const remote: any = require('@electron/remote')
            const dialog = remote.getBuiltin('dialog')
            const result: string[] = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
                title: '选择背景图',
                filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] }],
                properties: ['openFile'],
            })
            const picked = result?.[0]
            if (picked) {
                this.glass.wallpaper = this.relativize(picked)
                this.save()
            }
        } catch (e) {
            console.warn('[glass] file browse unavailable', e)
        }
    }

    setNumber (key: string, event: Event): void {
        const value = parseFloat((event.target as HTMLInputElement).value)
        if (!isNaN(value)) {
            this.glass[key] = value
            this.save()
        }
    }

    resetDefaults (): void {
        // 只恢复视觉参数; 壁纸路径是用户内容, 不参与重置
        this.glass.wallpaperOpacity = 0.7
        this.glass.overlayTop = 0.5
        this.glass.overlayBottom = 0.78
        this.glass.backgroundMode = 'image'
        this.glass.solidColor = DEFAULT_SOLID
        this.save()
    }

    private save (): void {
        clearTimeout(this.saveTimer)
        this.saveTimer = setTimeout(() => {
            this.config.save()
            // 点对点直调刷新 CSS 变量, 不依赖 changed$ 分发链
            ;(window as any).__glassRefresh?.()
        }, 400)
    }

    /** 配置根目录内 → './相对路径'; 之外 → 绝对路径 */
    private relativize (abs: string): string {
        const norm = abs.replace(/\\/g, '/')
        const root: string = (window as any).__glassConfigRoot?.() ?? ''
        if (root && norm.toLowerCase().startsWith(root.toLowerCase() + '/')) {
            return './' + norm.slice(root.length + 1)
        }
        return norm
    }
}
