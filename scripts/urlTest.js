// 复现/验证 applyGlassVars 的路径→URL 判断逻辑
const OLD = /^[a-zA-Z][a-zA-Z0-9+.-]*:/          // 当前(有 bug): D: 盘符被当成协议
const NEW = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//       // 修复: 协议必须带 //

const toUrl = (wp, re) => re.test(wp) ? wp : 'file:///' + wp.replace(/\\/g, '/')

const cases = [
    'D:/App/Tabby/resources/ac041.jpg',      // 默认壁纸 (正斜杠盘符路径)
    'D:\\App\\wall.jpg',                     // 反斜杠 Windows 路径
    'file:///D:/App/wall.jpg',               // 已带 file 协议
    'https://example.com/wall.jpg',          // http(s)
    '',
]
for (const c of cases) {
    console.log(JSON.stringify(c))
    console.log('  旧逻辑:', JSON.stringify(c === '' ? '(空→none)' : toUrl(c, OLD)))
    console.log('  新逻辑:', JSON.stringify(c === '' ? '(空→none)' : toUrl(c, NEW)))
}
