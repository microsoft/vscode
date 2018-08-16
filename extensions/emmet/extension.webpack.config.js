/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

module.exports = {
	// mode: 'production',
	// stats: 'errors-only',
	mode: 'none',
	context: __dirname,
	target: 'node',
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		mainFields: ['main'],
		extensions: [".ts", ".js"]
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{
				loader: 'ts-loader',
				options: { transpileOnly: true }
			}]
		}]
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist'),
		libraryTarget: "commonjs",
	},
	devtool: 'source-map',
	externals: {
		'vscode': 'commonjs vscode',
		'@emmetio/css-parser': 'commonjs @emmetio/css-parser',
		'@emmetio/html-matcher': 'commonjs @emmetio/html-matcher',
		'@emmetio/math-expression': 'commonjs @emmetio/math-expression',
		'image-size': 'commonjs image-size',
		'vscode-emmet-helper': 'commonjs vscode-emmet-helper',
	},
};
