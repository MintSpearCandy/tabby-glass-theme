// 提取 asar 内文件到临时目录: node scripts/asarExtract.js <innerPath> <outPath>
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
const base = Math.ceil(end / 4) * 4
const node = process.argv[2].split('/').reduce((n, seg) => n.files[seg], header)
const content = b.slice(base + parseInt(node.offset), base + parseInt(node.offset) + node.size)
fs.writeFileSync(process.argv[3], content)
console.log('extracted', content.length, 'bytes ->', process.argv[3])
