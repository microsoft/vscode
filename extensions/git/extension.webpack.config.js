/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	// mode: 'production',
	// stats: 'errors-only',
	mode: 'none',
	context: __dirname,
	target: 'node',
	node: {
		__dirname: false
	},
	entry: {
		main: './src/main.ts',
		['askpass-main']: './src/askpass-main.ts'
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
				options: {
					transpileOnly: true,
					compilerOptions: {
						"sourceMap": true,
					}
				}
			}]
		}]
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist'),
		libraryTarget: "commonjs"
	},
	plugins: [
		new CopyWebpackPlugin([
			{ from: './out/*.sh', to: '[name].sh' },
			{ from: './out/nls.*.json', to: '[name].json' }
		])
	],
	devtool: 'source-map',
	externals: {
		'vscode': 'commonjs vscode',
		"byline": 'commonjs byline',
		"file-type": 'commonjs file-type',
		"iconv-lite": 'commonjs iconv-lite',
		"jschardet": 'commonjs jschardet',
		"vscode-extension-telemetry": 'commonjs vscode-extension-telemetry',
		"vscode-nls": 'commonjs vscode-nls',
		"which": 'commonjs which',
	},
};
