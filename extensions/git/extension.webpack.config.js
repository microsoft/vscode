/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	stats: 'errors-only',
	// mode: 'none', // default is production
	context: __dirname,
	target: 'node',
	node: {
		__dirname: false
	},
	resolve: {
		mainFields: ['main']
	},
	entry: {
		main: './out/main.js',
		['askpass-main']: './out/askpass-main.js'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist'),
		libraryTarget: "commonjs"
	},
	externals: {
		'vscode': 'commonjs vscode',
	},
	plugins: [
		new CopyWebpackPlugin([{ from: './out/*.sh', to: '[name].sh' }])
	]
};
