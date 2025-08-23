// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// @ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const packageRoot = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(packageRoot, 'dist');

/** @type {(env: any, argv: { mode: 'production' | 'development' | 'none' }) => import('webpack').Configuration} */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nodeConfig = (_, { mode }) => ({
    context: packageRoot,
    entry: {
        extension: './src/client/browser/extension.ts',
    },
    target: 'webworker',
    output: {
        filename: '[name].browser.js',
        path: outDir,
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../../[resource-path]',
    },
    devtool: 'source-map',
    // stats: {
    //     all: false,
    //     errors: true,
    //     warnings: true,
    // },
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: { path: require.resolve('path-browserify') },
    },
    plugins: [
        new NodePolyfillPlugin(),
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
        }),
    ],
    externals: {
        vscode: 'commonjs vscode',

        // These dependencies are ignored because we don't use them, and App Insights has try-catch protecting their loading if they don't exist
        // See: https://github.com/microsoft/vscode-extension-telemetry/issues/41#issuecomment-598852991
        'applicationinsights-native-metrics': 'commonjs applicationinsights-native-metrics',
        '@opentelemetry/tracing': 'commonjs @opentelemetry/tracing',
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    configFile: 'tsconfig.browser.json',
                },
            },
            {
                test: /\.node$/,
                loader: 'node-loader',
            },
        ],
    },
    // optimization: {
    //     usedExports: true,
    //     splitChunks: {
    //         cacheGroups: {
    //             defaultVendors: {
    //                 name: 'vendor',
    //                 test: /[\\/]node_modules[\\/]/,
    //                 chunks: 'all',
    //                 priority: -10,
    //             },
    //         },
    //     },
    // },
});

module.exports = nodeConfig;
