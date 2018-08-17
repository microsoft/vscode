/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const sharedConfig = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const myConfig = {
	node: {
		__dirname: false // leave the __dirname-behaviour intact
	},
	entry: {
		main: './out/main.js',
		['askpass-main']: './out/askpass-main.js'
	},
	plugins: [
		new CopyWebpackPlugin([
			{ from: './out/*.sh', to: '[name].sh' },
			{ from: './out/nls.*.json', to: '[name].json' }
		])
	],
	externals: {
		'vscode': 'commonjs vscode', // ignored because it doesn't exist
		"byline": 'commonjs byline',
		"file-type": 'commonjs file-type',
		"iconv-lite": 'commonjs iconv-lite',
		"jschardet": 'commonjs jschardet',
		"vscode-extension-telemetry": 'commonjs vscode-extension-telemetry',
		"vscode-nls": 'commonjs vscode-nls',
		"which": 'commonjs which',
	},
};

module.exports = { ...sharedConfig(__dirname, false), ...myConfig };
