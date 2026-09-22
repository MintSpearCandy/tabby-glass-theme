const fs = require('fs')
let s = fs.readFileSync('/tmp/relnotes.md', 'utf8')
// 修复被 bash 转义吃掉的安装路径
s = s.replace(/解压到 [^\n]*?后重启 Tabby/, '解压到 `<userData>/plugins/node_modules/tabby-glass-theme/` 后重启 Tabby')
fs.writeFileSync('/tmp/relnotes.md', s)
console.log('tail now:', JSON.stringify(s.slice(-200)))
