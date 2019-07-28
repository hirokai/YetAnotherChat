// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
const webpack = require('webpack');

module.exports = env => {
    return {
        mode: (env.production ? 'production' : 'development'),
        // mode: 'development',
        entry: {
            main: './client/main.js',
            matrix: './client/matrix.js'
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
                }
            }]
        }
    }
};
