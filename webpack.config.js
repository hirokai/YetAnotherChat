// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

module.exports = env => {
    const mode = (env && env.production) ? 'production' : 'development';
    return {
        mode,
        // mode: 'development',
        entry: {
            main: './client/main.ts',
            // mobile_main: './client/mobile/main.ts',
            // matrix: './client/matrix.ts',
        },
        output: {
            filename: '[name].bundle.js',
            path: __dirname + '/public/js'
        },
        optimization: {
            usedExports: false,
            splitChunks: {
                cacheGroups: {
                    vendor: {
                        test: /node_modules/,
                        name: 'vendor',
                        chunks: 'initial',
                        enforce: true
                    },
                },
            },
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        extractComments: 'all',
                        compress: { drop_console: true }
                    },
                }),
            ]
        },
        plugins: [
            // new BundleAnalyzerPlugin({ analyzerPort: 4000, }),
            new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
        ],
        module: {
            rules: [{
                test: (file) => { return /\.elm$/.test(file) && !/client\/mobile\/view\/.+\.elm$/.test(file); },
                exclude: [/elm-stuff/, /node_modules/],
                use: {
                    loader: 'elm-webpack-loader',
                    options: { optimize: mode == 'production', debug: mode != 'production' }
                },
            }, {
                test: (file) => { return /client\/mobile\/view\/.+\.elm$/.test(file); },
                exclude: [/elm-stuff/, /node_modules/],
                use: {
                    loader: 'elm-webpack-loader',
                    options: { optimize: mode == 'production', debug: false }
                },
            }, {
                // 拡張子 .ts の場合
                test: /\.ts$/,
                // TypeScript をコンパイルする
                use: "ts-loader"
            }, {
                test: /\.css/,
                use: [
                    "style-loader",
                    {
                        loader: "css-loader",
                        options: { url: false }
                    }
                ]
            }]
        },
        resolve: {
            alias: {
            },
            modules: ['node_modules'],
            extensions: [".ts", ".js"]
        },
        externals: {
            'vue': 'Vue'
        }
    }
};
