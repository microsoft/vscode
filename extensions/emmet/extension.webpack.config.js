/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

module.exports = {
	mode: 'production',
	// mode: 'none',
	context: __dirname,
	target: 'node',
	resolve: {
		mainFields: ['main']
	},
	entry: {
		extension: './out/extension.js',
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist'),
		libraryTarget: "commonjs",
	},
	externals: {
		'vscode': 'commonjs vscode',
	},
	stats: 'errors-only',
	devtool: 'source-map'
};
