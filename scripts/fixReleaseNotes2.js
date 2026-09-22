const fs = require('fs')
const BT = String.fromCharCode(96) // backtick
let s = fs.readFileSync('test-env/relnotes.md', 'utf8')
const install =
    `**安装**: 下载下方任一格式, 解压到 ${BT}<userData>/plugins/node_modules/tabby-glass-theme/${BT} 后重启 Tabby, 在 设置 → 外观 → 主题 选择 **Glass**.\n` +
    `- ${BT}tabby-glass-theme-0.2.0.zip${BT} — Windows 友好, 解压即得 ${BT}tabby-glass-theme/${BT} 目录\n` +
    `- ${BT}tabby-glass-theme-0.2.0.tgz${BT} — npm pack 标准 tarball (顶层 ${BT}package/${BT}, 解压后重命名)\n` +
    `- ${BT}tabby-glass-theme-0.2.0.tabby-plugin${BT} — 同 tgz, Tabby 传统插件包扩展名`
s = s.replace(/\*\*安装\*\*:.*(\n- .*)*$/s, install)
fs.writeFileSync('test-env/relnotes.md', s)
console.log('--- final install section ---')
console.log(install)
