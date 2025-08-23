// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const copyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');
const constants = require('../constants');
const common = require('./common');

const entryItems = {};
common.nodeModulesToExternalize.forEach((moduleName) => {
    entryItems[`node_modules/${moduleName}`] = `./node_modules/${moduleName}`;
});
const config = {
    mode: 'production',
    target: 'node',
    context: constants.ExtensionRootDir,
    entry: entryItems,
    devtool: 'source-map',
    node: {
        __dirname: false,
    },
    module: {},
    externals: ['vscode', 'commonjs'],
    plugins: [
        ...common.getDefaultPlugins('dependencies'),
        // vsls requires our package.json to be next to node_modules. It's how they
        // 'find' the calling extension.
        // eslint-disable-next-line new-cap
        new copyWebpackPlugin({ patterns: [{ from: './package.json', to: '.' }] }),
    ],
    resolve: {
        extensions: ['.js'],
    },
    output: {
        filename: '[name].js',
        path: path.resolve(constants.ExtensionRootDir, 'out', 'client'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../../[resource-path]',
    },
};

exports.default = config;
