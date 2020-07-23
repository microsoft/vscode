/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';
const CopyPlugin = require('copy-webpack-plugin');
const { lchmod } = require('graceful-fs');
const Terser = require('terser');

const withBrowserDefaults = require('../shared.webpack.config').browser;

module.exports = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.browser.ts',
	},
	plugins: [
		// @ts-ignore
		new CopyPlugin({
			patterns: [
				{
					from: 'node_modules/typescript-web-server',
					to: 'typescript-web',
					transform: (content, absoluteFrom) => {
						if (absoluteFrom.endsWith('tsserver.js')) {
							return Terser.minify(content.toString()).code;
						}
						return content;
					},
					transformPath: (targetPath) => {
						if (targetPath.endsWith('tsserver.js')) {
							return targetPath.replace('tsserver.js', 'tsserver.web.js');
						}
						return targetPath;
					}
				}
			],
		}),
	],
});
