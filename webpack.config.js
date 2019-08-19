// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = env => {
    const mode = (env && env.production) ? 'production' : 'development';
    return {
        mode,
        // mode: 'development',
        entry: {
            main: './client/main.ts',
            matrix: './client/matrix.ts',
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
                test: /\.elm$/,
                exclude: [/elm-stuff/, /node_modules/],
                use: {
                    loader: 'elm-webpack-loader',
                    options: {}
                },
            }, {
                // 拡張子 .ts の場合
                test: /\.ts$/,
                // TypeScript をコンパイルする
                use: "ts-loader"
            }]
        },
        resolve: {
            alias: {
                'axios': path.resolve(__dirname, 'node_modules/axios/'),
                'moment': path.resolve(__dirname, 'node_modules/moment/'),
                'lodash-es': path.resolve(__dirname, 'node_modules/lodash-es/'),
                'jquery': path.resolve(__dirname, 'node_modules/jquery/')
            },
            modules: ['node_modules'],
            extensions: [".ts", ".js"]
        }
    }
};
