// 生成测试环境默认壁纸 <env>/data/resources/background.jpg
// 纯 node 生成 PNG (按内容识别, 扩展名无所谓), 1280x720 深-浅蓝垂直渐变
const fs = require('fs')
const zlib = require('zlib')

const W = 1280, H = 720
const raw = Buffer.alloc(H * (1 + W * 3)) // 每行 filter 字节 0 + RGB
for (let y = 0; y < H; y++) {
    const t = y / H
    const r = Math.round(10 + 30 * t), g = Math.round(14 + 40 * t), b = Math.round(36 + 70 * t)
    for (let x = 0; x < W; x++) {
        const o = y * (1 + W * 3) + 1 + x * 3
        raw[o] = r; raw[o + 1] = g; raw[o + 2] = b
    }
}
const crcTable = []
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 2 // 8bit, truecolor
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
])
const out = process.argv[2] || 'D:/Env/TabbyEnv/instances/main/data/resources/background.jpg'
fs.mkdirSync(require('path').dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('written', out, png.length, 'bytes')
