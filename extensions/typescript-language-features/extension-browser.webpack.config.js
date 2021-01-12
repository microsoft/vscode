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

const languages = [
	'zh-tw',
	'cs',
	'de',
	'es',
	'fr',
	'it',
	'ja',
	'ko',
	'pl',
	'pt-br',
	'ru',
	'tr',
	'zh-cn',
];

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
					from: 'node_modules/typescript-web/lib/*.d.ts',
					to: 'typescript-web/',
					flatten: true
				},
				{
					from: 'node_modules/typescript-web/lib/typesMap.json',
					to: 'typescript-web/'
				},
				...languages.map(lang => ({
					from: `node_modules/typescript-web/lib/${lang}/**/*`,
					to: 'typescript-web/',
					transformPath: (targetPath) => {
						return targetPath.replace(/node_modules[\/\\]typescript-web[\/\\]lib/, '');
					}
				}))
			],
		}),
		// @ts-ignore
		new CopyPlugin({
			patterns: [
				{
					from: 'node_modules/typescript-web/lib/tsserver.js',
					to: 'typescript-web/tsserver.web.js',
					transform: (content) => {
						return Terser.minify(content.toString()).code;

					},
					transformPath: (targetPath) => {
						return targetPath.replace('tsserver.js', 'tsserver.web.js');
					}
				}
			],
		}),
	],
});
