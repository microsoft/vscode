/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

module.exports = {
	// mode: 'none',
	mode: 'production',
	target: 'node',
	context: __dirname,
	entry: {
		main: './out/main.js',
		askpass: './out/askpass-main.js'
	},
	output: {
		filename: '[name].bundle.js',
		path: path.join(__dirname, 'dist'),
		libraryTarget: "commonjs"
	},
	externals: {
		'vscode': 'commonjs vscode',
	},
	stats: 'errors-only'
};
