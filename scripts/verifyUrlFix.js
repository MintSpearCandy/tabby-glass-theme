// 验证产物中的 URL 判定正则已修复: node scripts/verifyUrlFix.js
const fs = require('fs')
const src = fs.readFileSync('D:/Home/Project/TabbyPlugins/GlassTheme/dist/index.js', 'utf8')
// 找 applyGlassVars 里的 url 拼接行
const i = src.indexOf('file:///')
const ctx = src.substr(Math.max(0, i - 200), 320)
console.log('拼接处原文:', JSON.stringify(ctx))
const hasNewRegex = /: \\?\/\\?\/|:\/\/\//.test(ctx) || ctx.includes(':\\/\\//')
console.log('修复判定:', hasNewRegex ? '✓ 新正则 (含 //)' : '✗ 仍是旧正则')
