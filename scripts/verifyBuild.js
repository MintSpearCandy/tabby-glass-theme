// 构建产物规则验证: node scripts/verifyBuild.js
const fs = require('fs')
const src = fs.readFileSync('D:/Home/Project/TabbyPlugins/GlassTheme/dist/index.js', 'utf8')
const flat = src.replace(/,\s+/g, ',').replace(/:\s+/g, ':').replace(/\s+/g, ' ')
const checks = {
    'pills 选中暗块 (覆盖)': 'nav-pills-link-active-bg:rgba(0,0,0,0.3)',
    'pills 选中文字白': 'nav-pills-link-active-color:#f1f1f1',
    'tabs 选中白系': 'nav-tabs-link-active-color:#f1f1f1',
    'tabs 选中边线白': 'nav-tabs-link-active-border-color:rgba(255,255,255,0.3)',
    '列表黑底': 'list-group-bg:rgba(0,0,0,0.2)',
    '列表 hover 黑': 'list-group-action-hover-bg:rgba(0,0,0,0.3)',
    'secondary-bg 黑系': '--bs-secondary-bg:rgba(0,0,0,0.25)',
    'tertiary-bg 黑系': '--bs-tertiary-bg:rgba(0,0,0,0.15)',
}
let all = true
for (const [name, needle] of Object.entries(checks)) {
    const ok = flat.includes(needle)
    if (!ok) all = false
    console.log(ok ? '✓' : '✗', name)
}
// pills: 覆盖块必须出现在 bootstrap 基础块之后 (后置生效)
const base = flat.indexOf('nav-pills-link-active-bg:#96cafe')
const override = flat.indexOf('nav-pills-link-active-bg:rgba(0,0,0,0.3)')
console.log(override > base ? '✓' : '✗', 'pills 覆盖位于基础块之后', `(${base} < ${override})`)
console.log(all && override > base ? 'ALL PASS' : 'SOME FAILED')
