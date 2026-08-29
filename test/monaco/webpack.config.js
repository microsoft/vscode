/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const WarningsToErrorsPlugin = require('warnings-to-errors-webpack-plugin');

module.exports = {
	mode: 'production',
	entry: {
		'core': './core.js',
		'editorWebWorkerMain': '../../out-monaco-editor-core/esm/vs/editor/common/services/editorWebWorkerMain.js',
	},
	output: {
		globalObject: 'self',
		filename: '[name].bundle.js',
		path: path.resolve(__dirname, './dist')
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: ['style-loader', 'css-loader'],
			},
			{
				test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
				use: [
					{
						loader: 'file-loader',
						options: {
							name: '[name].[ext]',
							outputPath: 'fonts/'
						}
					}
				]
			}
		]
	},
	resolve: {
		alias: {
			'monaco-editor-core': path.resolve(__dirname, '../../out-monaco-editor-core/esm/vs/editor/editor.main.js'),
		}
	},
	stats: {
		all: false,
		modules: true,
		errors: true,
		warnings: true,
		// our additional options
		moduleTrace: true,
		errorDetails: true,
		chunks: true
	},
	plugins: [
		new WarningsToErrorsPlugin()
	],
	optimization: {
		// Without it, CI fails, which indicates a webpack minification bug.
		minimize: false,
	},
};
