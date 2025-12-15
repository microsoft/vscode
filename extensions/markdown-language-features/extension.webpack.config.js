/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import CopyPlugin from 'copy-webpack-plugin';
import withDefaults, { nodePlugins } from '../shared.webpack.config.mjs';

export default withDefaults({
	context: import.meta.dirname,
	resolve: {
		mainFields: ['module', 'main']
	},
	entry: {
		extension: './src/extension.ts',
	},
	plugins: [
		...nodePlugins(import.meta.dirname), // add plugins, don't replace inherited
		new CopyPlugin({
			patterns: [
				{
					from: './node_modules/vscode-markdown-languageserver/dist/node/workerMain.js',
					to: 'serverWorkerMain.js',
				}
			],
		}),
	],
});
