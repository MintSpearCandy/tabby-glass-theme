# tabby-glass-theme

[Tabby](https://github.com/Eugeny/tabby) 深色玻璃质感主题插件。

深色玻璃拟态 UI：壁纸背景 + 渐变遮罩、亚克力风模糊面板、WezTerm 式紧凑标签栏、内置 IR_Black 终端配色。主题完全自足（自带 Bootstrap 深色变量），整体替换默认主题样式。

## 功能

- **壁纸背景**：终端区域透出壁纸，可调遮罩浓度（顶部/底部渐变）
- **玻璃面板**：弹窗 / 下拉菜单 / 搜索面板带 `backdrop-filter` 亚克力模糊与受光顶边
- **标签栏**：紧凑无衬线风（隐藏序号、类型图标、激活 tab 纯黑底）、后台活动指示条
- **终端配色**：内置 IR_Black 配色方案（Canvas 前端免 WebGL 二次采样晕边）
- **设置页**：Glass 专属设置分页（壁纸路径 / 透明度 / 遮罩等），快捷键 `Ctrl+Alt+B` 快速切换壁纸开关
- **窗口不透明度**：默认 0.93，可在设置调整

## 安装

### 方式一：本地安装（无需发布）

```bash
git clone https://github.com/MintSpearCandy/tabby-glass-theme.git
cd tabby-glass-theme
npm install && npm run build
```

然后在 Tabby 中：设置 → 插件 → **从文件夹安装**，选择本目录，重启后于
设置 → 外观 → 主题 选择 **Glass**。

### 方式二：release 归档

从 [Releases](https://github.com/MintSpearCandy/tabby-glass-theme/releases) 下载
`tabby-glass-theme-<version>.tabby-plugin`（tar.gz 格式），解压到
`<userData>/plugins/node_modules/tabby-glass-theme/` 后重启。

## 设置项

主题注册独立配置节 `glass:`（config.yaml）：

| 键 | 默认 | 说明 |
|---|---|---|
| `wallpaper` | — | 壁纸图片绝对路径 |
| `wallpaperEnabled` | `true` | 壁纸开关（快捷键 `Ctrl+Alt+B`） |
| `wallpaperOpacity` | `0.7` | 壁纸不透明度 |
| `overlayTop` / `overlayBottom` | `0.5` / `0.78` | 上下渐变遮罩浓度 |

也可在 设置 → Glass 分页 图形化调整。

## 已知问题

- Tabby 1.0.235 上游 bug：设置 → 快捷键 页中键位胶囊的 × 删除按钮无法触发
  （`(mousedown)` 绑定链路失效，与本主题无关，默认主题同样复现）。
  临时方案：设置 → Config file 中直接编辑 `hotkeys:` 段。

## 开发

```bash
npm install
npm run build    # 产物: dist/index.js (含内联 CSS)
npm run watch    # 开发监视模式
```

- `src/index.ts` — 主题注册 / 配置迁移 / 壁纸与透明度逻辑
- `src/theme.scss` — 完整样式表（自带 Bootstrap，整体替换默认主题）
- `docs/theme.scss.draft-*.scss` — 结构化源码历史草稿

## 许可

[MIT](./LICENSE)

## 参考

- 官方模板: [Eugeny/tabby-theme-hype](https://github.com/Eugeny/tabby-theme-hype)
- 设计蓝本: WezTerm 配置迁移
