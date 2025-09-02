/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const withDefaults = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Create a custom config that excludes kernel-bridge from the default copying
const config = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	node: {
		__dirname: false
	},
	externals: {
		'bufferutil': 'commonjs bufferutil',
		'utf-8-validate': 'commonjs utf-8-validate'
	}
});

// Override the CopyWebpackPlugin to exclude kernel-bridge
config.plugins = config.plugins.map(plugin => {
	if (plugin.constructor.name === 'CopyWebpackPlugin') {
		return new CopyWebpackPlugin({
			patterns: [
				{ 
					from: 'src', 
					to: '.', 
					globOptions: { 
						ignore: [
							'**/test/**', 
							'**/*.ts', 
							'**/*.tsx',
							'**/kernel-bridge/**'  // Exclude the entire kernel-bridge directory
						] 
					}, 
					noErrorOnMissing: true 
				}
			]
		});
	}
	return plugin;
});

module.exports = config;
