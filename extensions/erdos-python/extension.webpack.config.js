/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Posit Software, PBC.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

// Load the webpack config for the Python extension
const config = require('./build/webpack/webpack.extension.config');

// Merge them with settings for this environment
module.exports = {
    ...config.default,
    entry: {
        extension: './src/client/extension.ts',
    },
    externals: [
        'vscode',
        'erdos',
        'commonjs',
        'applicationinsights-native-metrics',
        '@opentelemetry/tracing',
        '@opentelemetry/instrumentation',
        '@azure/opentelemetry-instrumentation-azure-sdk',
        '@azure/functions-core'
    ],
    output: {
        filename: '[name].js',
        path: path.join(__dirname, 'dist', 'client'),
        libraryTarget: 'commonjs',
    },
    context: __dirname
};
