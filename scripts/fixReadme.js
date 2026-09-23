const fs = require('fs')
const BT = String.fromCharCode(96)
let s = fs.readFileSync('README.md', 'utf8')
const idx = s.indexOf('## 主题总开关说明')
if (idx === -1) throw new Error('section not found')
s = s.slice(0, idx) + `## 主题总开关说明

开关位于 设置 → Glass Theme → ${BT}启用 Glass 主题${BT}。这是 **Theme 注入的总开关**:

- **打开**: Glass CSS 生效 + 冲突配置锁定 (标签页位置/窗口边框/不透明度/亚克力/终端背景/停靠/侧栏/弹性标签) + 终端字体/配色/前端迁移为 Glass 预设; 被锁项在 设置 → Window 页显示 🔒
- **关闭**: 完整还原 —— appearance.theme 回到您原本的主题 (Glass CSS 随之卸载, 您的自定义 CSS 不受影响), 所有被接管配置按快照还原, 壁纸层/锁定徽标一并清除
- **用户原值快照**持久保存在 ${BT}glass.lockBackup${BT} (崩溃/强杀后下次启动自动自愈还原)
- 锁定值若与 Tabby 默认值相同, 配置文件中该键自动回到"未设置"态 (Tabby 原生机制)
- 注意: ${BT}appearance.frame${BT} 切换需重启 Tabby 完全生效 (Electron 窗口属性限制)

> 实现说明: Tabby 的 ConfigProxy 访问器 ${BT}configurable:false${BT} 且 ${BT}save()${BT} 无钩子,
> "运行时拦截读取、配置文件零变化"在架构上不可行; 本方案为快照+还原 (Tabby
> 官方"写 store + save"模式的正规用法), 您的原始设置永不丢失。
`
fs.writeFileSync('README.md', s)
console.log('README tail fixed, ends with:', JSON.stringify(s.slice(-80)))
