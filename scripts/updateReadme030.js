// 发布前 README 修订: 功能列表 + 安装版本引用 + 总开关说明段
const fs = require('fs')
const BT = String.fromCharCode(96)
let s = fs.readFileSync('README.md', 'utf8')

// 1. 功能列表补总开关/设置页/动态壁纸
s = s.replace(
    '- **Theme 锁定**：一键接管与主题冲突的 8 项 Tabby 设置（标签页位置/窗口边框/窗口不透明度/亚克力背景/终端背景/停靠/侧栏/弹性标签），被锁项在 设置 → Window 页显示 🔒 标记；关闭开关即按快照还原用户原值',
    '- **主题总开关**：设置 → Glass Theme → "启用主题"一键隔离整个 Theme 注入——打开时 Glass CSS 生效并接管冲突设置（标签页位置/窗口边框/不透明度/亚克力背景/终端背景/停靠/侧栏/标签宽度，被锁项在 设置 → Window 页显示 🔒）；关闭时完整还原您原本的主题与全部设置（原值快照持久保存在 ' + BT + 'glass.lockBackup' + BT + '，崩溃后下次启动自愈还原）\n' +
    '- **设置页**：Glass 专属设置分页（form-line 布局 + 精简命名 + 小字说明），快捷键 ' + BT + 'Ctrl+Alt+B' + BT + ' 切换壁纸\n' +
    '- **动态默认壁纸**：留空自动使用 ' + BT + '<userData>/resources/background.jpg' + BT + '，显式路径优先',
)
// 兼容旧文本（若上面精确匹配失败则不动，由下方检查报告）
s = s.replace('快捷键 `Ctrl+Alt+B` 快速切换壁纸开关', '快捷键 `Ctrl+Alt+B` 切换壁纸')

fs.writeFileSync('README.md', s)
console.log('master-switch bullet updated:', s.includes('主题总开关'))
console.log('dynamic wallpaper bullet:', s.includes('动态默认壁纸'))
