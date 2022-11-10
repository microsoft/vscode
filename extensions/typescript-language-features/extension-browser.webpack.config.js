/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';
const CopyPlugin = require('copy-webpack-plugin');
const Terser = require('terser');
const fs = require('fs');
const path = require('path');

const defaultConfig = require('../shared.webpack.config');
const withBrowserDefaults = defaultConfig.browser;
const browserPlugins = defaultConfig.browserPlugins;

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
		...browserPlugins(__dirname), // add plugins, don't replace inherited

		// @ts-ignore
		new CopyPlugin({
			patterns: [
				{
					from: '../node_modules/typescript/lib/*.d.ts',
					to: 'typescript/',
					flatten: true
				},
				{
					from: '../node_modules/typescript/lib/typesMap.json',
					to: 'typescript/'
				},
				...languages.map(lang => ({
					from: `../node_modules/typescript/lib/${lang}/**/*`,
					to: 'typescript/',
					transformPath: (targetPath) => {
						return targetPath.replace(/\.\.[\/\\]node_modules[\/\\]typescript[\/\\]lib/, '');
					}
				}))
			],
		}),
		// @ts-ignore
		new CopyPlugin({
			patterns: [
				{
					from: '../node_modules/typescript/lib/tsserverlibrary.js',
					to: 'typescript/tsserver.web.js',
					transform: async (content) => {
						const hostpath = path.join(__dirname, 'web', 'out', 'webServer.js');
						const host =  fs.existsSync(hostpath) ? fs.readFileSync(hostpath) : undefined;
						const output = await Terser.minify(content.toString());
						if (!output.code) {
							throw new Error('Terser returned undefined code');
						}

						if (host) {
							return output.code + '\n' + host;
						}
						return output.code;
					},
					transformPath: (targetPath) => {
						return targetPath.replace('tsserver.js', 'tsserver.web.js');
					}
				}
			],
		}),
	],
});
