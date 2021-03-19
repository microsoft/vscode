/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	context: path.resolve(__dirname),
	mode: 'production',
	performance: {
		hints: false,
		maxEntrypointSize: 512000,
		maxAssetSize: 512000
	},
	entry: {
		katex: './notebook/katex.ts',
		emoji: './notebook/emoji.ts',
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
			},
		],
	},
	resolve: {
		extensions: ['.tsx', '.ts', '.js']
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'notebook-out')
	},
	plugins: [
		// @ts-ignore
		new CopyPlugin({
			patterns: [
				{
					from: './node_modules/katex/dist/katex.min.css',
					to: 'katex.min.css'
				},
				{
					from: './node_modules/katex/dist/fonts',
					to: 'fonts/'
				},
			],
		}),
	]
};
