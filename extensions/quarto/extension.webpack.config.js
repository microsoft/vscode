/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/main.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'out')
	},
	resolve: {
		alias: {
			'core': path.resolve(__dirname, 'packages/core/src'),
			'core-node': path.resolve(__dirname, 'packages/core-node/src'),
			'core-browser': path.resolve(__dirname, 'packages/core-browser/src'),
			'editor-core': path.resolve(__dirname, 'packages/editor-core/src'),
			'editor-server': path.resolve(__dirname, 'packages/editor-server/src'),
			'editor-types': path.resolve(__dirname, 'packages/editor-types/src'),
			'quarto-core': path.resolve(__dirname, 'packages/quarto-core/src')
		}
	},
	externals: {
		'bufferutil': 'commonjs bufferutil',
		'utf-8-validate': 'commonjs utf-8-validate'
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: [
				{
					from: 'bin/**/*',
					to: '../',
					noErrorOnMissing: true
				},
				{
					from: 'assets/**/*',
					to: '../',
					noErrorOnMissing: true
				}
			]
		})
	]
});
