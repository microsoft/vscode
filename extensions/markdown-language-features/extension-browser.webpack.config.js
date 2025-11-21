/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import CopyPlugin from 'copy-webpack-plugin';
import { browser, browserPlugins } from '../shared.webpack.config.mjs';

export default browser({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.browser.ts'
	},
	plugins: [
		...browserPlugins(import.meta.dirname), // add plugins, don't replace inherited
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
