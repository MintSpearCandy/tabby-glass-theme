// 发布 v0.4.0 README 修订: 总开关章节 → 原生主题说明
const fs = require('fs')
const BT = String.fromCharCode(96)
let s = fs.readFileSync('README.md', 'utf8')

// 1. 功能列表: 总开关条目 → 原生主题条目
s = s.replace(
    /- \*\*主题总开关\*\*：[\s\S]*?\n(?=- \*\*设置页\*\*)/,
    '- **常规原生主题**：设置 → 外观 → 主题 选择 Glass 即可——Tabby 原生切换链路，终端透明走原生 ' + BT + 'Theme.terminalBackground' + BT + '，不接管/锁定任何宿主配置\n',
)
// 2. 删除"主题总开关说明"整章 (从标题到下一个 ## 或文末)
s = s.replace(/\n## 主题总开关说明[\s\S]*?(?=\n## |$)/, '\n## 主题说明\n\nGlass 是常规 Tabby 主题: 设置 → 外观 → 主题 选择 ' + BT + 'Glass' + BT + '. 内置 IR_Black 配色 (不透明黑底) 可在 配色 列表自由选用. 旧版本 (v0.3.x) 的"总开关/配置接管"方案已移除, 升级后插件会自动清理其配置残留并还原.\n')

fs.writeFileSync('README.md', s)
console.log('master-switch gone:', !s.includes('主题总开关'))
console.log('native bullet:', s.includes('常规原生主题'))
console.log('sections:', (s.match(/^## .*/gm) || []).join(' | '))
