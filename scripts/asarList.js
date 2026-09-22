// 列出 app.asar 结构, 定位主进程入口
const fs = require('fs')
const b = fs.readFileSync('D:/App/Tabby/resources/app.asar')
const jsonStart = b.indexOf('{')
let depth = 0, end = -1, inStr = false, esc = false
for (let i = jsonStart; i < b.length; i++) {
    const c = String.fromCharCode(b[i])
    if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (!depth) { end = i + 1; break } }
}
const header = JSON.parse(b.slice(jsonStart, end).toString())
console.log('顶层:', Object.keys(header.files))
for (const dir of ['tabby', 'dist', '.']) {
    if (header.files[dir]?.files) {
        console.log(dir + '/:', Object.keys(header.files[dir].files).filter(f => f.endsWith('.js') || !f.includes('.')).slice(0, 20))
    }
}
if (header.files['package.json']) {
    const base = Math.ceil(end / 4) * 4
    const node = header.files['package.json']
    const pkg = JSON.parse(b.slice(base + parseInt(node.offset), base + parseInt(node.offset) + node.size).toString())
    console.log('package.json main:', pkg.main)
}
