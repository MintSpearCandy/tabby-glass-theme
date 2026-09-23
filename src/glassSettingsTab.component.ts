import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'

/**
 * Glass 主题设置页 (设置 → Glass Theme)
 * 所有改动经 config.store.glass.* 写入 → save() → changed$ → CSS 变量即时生效
 */
@Component({
    template: `
        <div class="content-box">
            <h3>Glass Theme</h3>

            <div class="form-check form-switch">
                <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="glassThemeEnabled"
                    [checked]="glass.themeEnabled !== false"
                    (change)="setThemeEnabled($event)"
                >
                <label class="form-check-label" for="glassThemeEnabled">
                    启用 Glass 主题 (Theme 注入总开关)
                </label>
                <div class="glass-lock-note">
                    <small class="text-muted" *ngIf="glass.themeEnabled !== false; else themeOffHint">
                        Glass CSS 与以下设置接管中; 被锁项在 设置 → Window 页显示
                        <i class="fas fa-lock glass-lock-badge"></i> 标记。
                        <strong>关闭开关将完整还原您的原主题与全部配置</strong> (含字体/配色等迁移项):
                    </small>
                    <ng-template #themeOffHint>
                        <small class="text-muted">
                            主题注入已关闭 —— 您自己的主题与配置已还原 (Glass 未修改任何您的原始值,
                            快照保存在 glass.lockBackup)。重新打开即恢复玻璃主题接管
                        </small>
                    </ng-template>
                    <ul class="glass-lock-list" *ngIf="glass.themeEnabled !== false">
                        <li><i class="fas fa-lock glass-lock-badge"></i> 外观主题 → Glass</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 标签页位置 → 顶部</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 窗口边框 → 细边框 (Thin)</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 窗口不透明度 → 0.93</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 亚克力背景 (Vibrancy) → 关闭</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 终端背景 → 跟随主题</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 停靠终端 → 关闭</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 配置文件侧栏 → 关闭</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 标签页宽度 → 固定 (非弹性)</li>
                        <li><i class="fas fa-lock glass-lock-badge"></i> 终端字体/配色/前端 → Glass 预设</li>
                    </ul>
                </div>
            </div>

            <div class="form-check form-switch">
                <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="glassWallpaperEnabled"
                    [checked]="glass.wallpaperEnabled !== false"
                    (change)="setEnabled($event)"
                >
                <label class="form-check-label" for="glassWallpaperEnabled">
                    启用背景图 (Ctrl-Alt-B 快捷切换)
                </label>
            </div>

            <div class="form-group">
                <label>背景图 (Background image)</label>
                <input
                    type="text"
                    class="form-control"
                    [value]="glass.wallpaper ?? ''"
                    (change)="setWallpaper($event)"
                    placeholder="本地绝对路径或 http(s):///file:/// URL, 留空为纯色底"
                >
                <small class="text-muted">
                    本地绝对路径 (D:\\path\\wallpaper.jpg) 或 http(s)/file:/// URL; 留空则不加载壁纸
                </small>
            </div>

            <div class="form-group">
                <label>壁纸不透明度 (Wallpaper opacity): {{ glass.wallpaperOpacity ?? 0.7 }}</label>
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

            <div class="form-group">
                <label>顶部遮罩暗度 (Overlay top): {{ glass.overlayTop ?? 0.5 }}</label>
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

            <div class="form-group">
                <label>底部遮罩暗度 (Overlay bottom): {{ glass.overlayBottom ?? 0.78 }}</label>
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

            <div class="form-group">
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

    setEnabled (event: Event): void {
        this.glass.wallpaperEnabled = (event.target as HTMLInputElement).checked
        this.save()
    }

    setThemeEnabled (event: Event): void {
        const on = (event.target as HTMLInputElement).checked
        this.glass.themeEnabled = on
        // 总开关立即生效 (接管/还原), 不等 debounce 分发链
        ;(window as any).__glassSetTheme?.(on)
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
