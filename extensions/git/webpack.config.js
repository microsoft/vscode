/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

module.exports = {
	mode: 'production',
	target: 'node',
	entry: './out/main.js',
	output: {
		filename: 'main.js',
		path: path.resolve(__dirname, 'dist'),
		libraryTarget: "commonjs"
	},
	externals: {
		'vscode': 'commonjs vscode',
	},
	devtool: 'source-map'
};
