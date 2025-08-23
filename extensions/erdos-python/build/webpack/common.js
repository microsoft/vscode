// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const glob = require('glob');
const path = require('path');
// eslint-disable-next-line camelcase
const webpack_bundle_analyzer = require('webpack-bundle-analyzer');
const constants = require('../constants');

exports.nodeModulesToExternalize = [
    'unicode/category/Lu',
    'unicode/category/Ll',
    'unicode/category/Lt',
    'unicode/category/Lo',
    'unicode/category/Lm',
    'unicode/category/Nl',
    'unicode/category/Mn',
    'unicode/category/Mc',
    'unicode/category/Nd',
    'unicode/category/Pc',
    'source-map-support',
    'sudo-prompt',
    'node-stream-zip',
    'xml2js',
];
exports.nodeModulesToReplacePaths = [...exports.nodeModulesToExternalize];
function getDefaultPlugins(name) {
    const plugins = [];
    // Only run the analyzer on a local machine or if required
    if (!constants.isCI || process.env.VSC_PYTHON_FORCE_ANALYZER) {
        plugins.push(
            new webpack_bundle_analyzer.BundleAnalyzerPlugin({
                analyzerMode: 'static',
                reportFilename: `${name}.analyzer.html`,
                generateStatsFile: true,
                statsFilename: `${name}.stats.json`,
                openAnalyzer: false, // Open file manually if you want to see it :)
            }),
        );
    }
    return plugins;
}
exports.getDefaultPlugins = getDefaultPlugins;
function getListOfExistingModulesInOutDir() {
    const outDir = path.join(constants.ExtensionRootDir, 'out', 'client');
    const files = glob.sync('**/*.js', { sync: true, cwd: outDir });
    return files.map((filePath) => `./${filePath.slice(0, -3)}`);
}
exports.getListOfExistingModulesInOutDir = getListOfExistingModulesInOutDir;
