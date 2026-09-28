import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'

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
                    <div class="title">背景图</div>
                    <div class="description">
                        留空使用默认图片; 支持 http(s):// 或 file:/// URL 与本地绝对路径
                    </div>
                </div>
                <input
                    type="text"
                    class="form-control"
                    [value]="glass.wallpaper ?? ''"
                    (change)="setWallpaper($event)"
                    [placeholder]="defaultWallpaper"
                >
                <div class="form-check form-switch glass-settings-inline-switch">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="glassWallpaperEnabled"
                        [checked]="glass.wallpaperEnabled !== false"
                        (change)="setEnabled($event)"
                    >
                    <label class="form-check-label" for="glassWallpaperEnabled">显示背景图</label>
                    <span class="text-muted glass-settings-kbd">Ctrl+Alt+B</span>
                </div>
            </div>

            <div class="form-line">
                <div class="header">
                    <div class="title"><span>图片不透明度</span><span class="glass-value">{{ glass.wallpaperOpacity ?? 0.7 }}</span></div>
                    <div class="description">壁纸与深色底的混合强度, 越低壁纸越暗</div>
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
})
export class GlassSettingsTabComponent {
    private saveTimer: any = null

    constructor (
        public config: ConfigService,
    ) { }

    get glass (): any {
        return this.config.store.glass
    }

    /** 壁纸默认路径: <userData>/resources/background.jpg (引擎侧同源回退, 见 index.ts) */
    get defaultWallpaper (): string {
        return (window as any).__glassDefaultWallpaper?.() ?? ''
    }

    setEnabled (event: Event): void {
        this.glass.wallpaperEnabled = (event.target as HTMLInputElement).checked
        this.save()
    }

    setWallpaper (event: Event): void {
        const value = (event.target as HTMLInputElement).value.trim()
        this.glass.wallpaper = value
        this.save()
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
}
