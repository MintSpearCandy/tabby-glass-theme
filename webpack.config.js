const path = require('path')

// 官方主题插件模板 (tabby-theme-hype) 的构建配置:
// - target: node       插件在 Tabby 主进程中以 CommonJS 加载
// - externals          @angular/* / @ng-bootstrap/* / tabby-* 由宿主提供, 不打进包
// - .scss 经 sass -> css -> to-string 内联为 JS 字符串, 最终全部收进 dist/index.js
module.exports = {
    mode: 'production',
    target: 'node',
    entry: './src/index.ts',
    devtool: 'source-map',
    context: __dirname,
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        libraryTarget: 'umd',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.scss$/,
                use: [
                    'to-string-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            // 主题里的 url() 必须原样保留:
                            // 壁纸走 file:// 协议, Bootstrap 图标走 data: URI,
                            // 都不需要 (也不能) 被 webpack 解析打包
                            url: false,
                        },
                    },
                    'sass-loader',
                ],
                exclude: /node_modules/,
            },
        ],
    },
    externals: [
        /^@angular\//,
        /^@ng-bootstrap\//,
        /^rxjs/,
        /^tabby-/,
    ],
}
