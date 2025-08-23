// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const path = require('path');
// eslint-disable-next-line camelcase
const tsconfig_paths_webpack_plugin = require('tsconfig-paths-webpack-plugin');
const constants = require('../constants');
const common = require('./common');

const configFileName = path.join(constants.ExtensionRootDir, 'tsconfig.extension.json');
// Some modules will be pre-genearted and stored in out/.. dir and they'll be referenced via
// NormalModuleReplacementPlugin. We need to ensure they do not get bundled into the output
// (as they are large).
const existingModulesInOutDir = common.getListOfExistingModulesInOutDir();
const config = {
    mode: 'production',
    target: 'node',
    entry: {
        extension: './src/client/extension.ts',
        'shellExec.worker': './src/client/common/process/worker/shellExec.worker.ts',
        'plainExec.worker': './src/client/common/process/worker/plainExec.worker.ts',
        'registryKeys.worker': 'src/client/pythonEnvironments/common/registryKeys.worker.ts',
        'registryValues.worker': 'src/client/pythonEnvironments/common/registryValues.worker.ts',
    },
    devtool: 'source-map',
    node: {
        __dirname: false,
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: path.join(__dirname, 'loaders', 'externalizeDependencies.js'),
                    },
                ],
            },
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                    },
                ],
            },
            {
                test: /\.node$/,
                use: [
                    {
                        loader: 'node-loader',
                    },
                ],
            },
            {
                test: /\.worker\.js$/,
                use: { loader: 'worker-loader' },
            },
        ],
    },
    externals: [
        'vscode',
        'commonjs',
        ...existingModulesInOutDir,
        // These dependencies are ignored because we don't use them, and App Insights has try-catch protecting their loading if they don't exist
        // See: https://github.com/microsoft/vscode-extension-telemetry/issues/41#issuecomment-598852991
        'applicationinsights-native-metrics',
        '@opentelemetry/tracing',
        '@azure/opentelemetry-instrumentation-azure-sdk',
        '@opentelemetry/instrumentation',
        '@azure/functions-core',
    ],
    plugins: [...common.getDefaultPlugins('extension')],
    resolve: {
        extensions: ['.ts', '.js'],
        plugins: [new tsconfig_paths_webpack_plugin.TsconfigPathsPlugin({ configFile: configFileName })],
        conditionNames: ['import', 'require', 'node'],
    },
    output: {
        filename: '[name].js',
        path: path.resolve(constants.ExtensionRootDir, 'out', 'client'),
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../../[resource-path]',
    },
};

exports.default = config;
