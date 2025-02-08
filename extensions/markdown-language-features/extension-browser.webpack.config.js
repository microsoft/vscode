/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const CopyPlugin = require('copy-webpack-plugin');
const { browserPlugins, browser } = require('../shared.webpack.config');

module.exports = browser({
	context: __dirname,
	entry: {
		extension: './src/extension.browser.ts'
	},
	plugins: [
		...browserPlugins(__dirname), // add plugins, don't replace inherited
		new CopyPlugin({
			patterns: [
				{
					from: './node_modules/vscode-markdown-languageserver/dist/browser/workerMain.js',
					to: 'serverWorkerMain.js',
				}
			],
		}),
	],
}, {
	configFile: 'tsconfig.browser.json'
});
