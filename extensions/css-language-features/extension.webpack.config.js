/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = withDefaults({
	context: path.join(__dirname, 'client'),
	entry: {
		extension: './src/cssMain.ts',
	},
	output: {
		filename: 'cssMain.js',
		path: path.join(__dirname, 'client', 'dist'),
		libraryTarget: "commonjs",
	},
	externals: {
		'./files': 'commonjs', // ignored because it doesn't exist
	},
	plugins: [
		new CopyWebpackPlugin([
			{ from: './out/*.sh', to: '[name].sh' },
			{ from: './out/nls.*.json', to: '[name].json' }
		])
	]
});
