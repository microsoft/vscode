const path = require('path');
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const isProd = process.argv.indexOf('--mode=production') >= 0;

module.exports = {
    entry: {
        app: './src/vue/main.ts',
        query: './src/vue/result/main.ts'
    },
    plugins: [
        new VueLoaderPlugin(),
        new HtmlWebpackPlugin({ 
            inject: true, 
            template: './public/index.html', 
            chunks: ['app'], 
            filename: 'app.html' 
        }),
        new HtmlWebpackPlugin({ 
            inject: true, 
            templateContent: `<head><script src="js/oldCompatible.js"></script></head><body> <div id="app"></div> </body>`, 
            chunks: ['query'], 
            filename: 'result.html' 
        }),
        new CopyWebpackPlugin({
            patterns: [{ from: 'public', to: './' }]
        }),
    ],
    output: {
        path: path.resolve(__dirname, 'media'),
        filename: 'js/[name].js'
    },
    resolve: {
        extensions: ['.vue', '.js', '.ts'],
        alias: { 
            'vue$': 'vue/dist/vue.esm.js', 
            '@': path.resolve('src'),
        }
    },
    module: {
        rules: [
            { 
                test: /\.vue$/, 
                loader: 'vue-loader', 
                options: { 
                    loaders: { 
                        css: ["vue-style-loader", "css-loader"] 
                    } 
                } 
            },
            { 
                test: /\.ts$/, 
                exclude: /node_modules/, 
                use: [{
                    loader: 'ts-loader',
                    options: {
                        appendTsSuffixTo: [/\.vue$/],
                        transpileOnly: true,
                        configFile: path.resolve(__dirname, 'tsconfig.webpack.json')
                    }
                }]
            },
            { 
                test: /(\.css|\.cssx)$/, 
                use: ["vue-style-loader", "css-loader", { loader: "postcss-loader" }] 
            },
            { 
                test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/, 
                loader: 'url-loader', 
                options: { limit: 80000 } 
            }
        ]
    },
    optimization: {
        minimize: isProd,
        splitChunks: {
            cacheGroups: {
                antv: { name: "antv", test: /[\\/]@antv[\\/]/, chunks: "all", priority: 10 },
                vendor: { name: "vendor", test: /[\\/]node_modules[\\/]/, chunks: "all", priority: -1 }
            }
        }
    },
    watch: !isProd,
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'source-map',
};
