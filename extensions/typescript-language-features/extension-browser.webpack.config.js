/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import CopyPlugin from 'copy-webpack-plugin';
import path from 'path';
import defaultConfig, { browser as withBrowserDefaults, browserPlugins } from '../shared.webpack.config.mjs';

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
export default [withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.browser.ts',
	},
	plugins: [
		...browserPlugins(import.meta.dirname), // add plugins, don't replace inherited

		// @ts-ignore
		new CopyPlugin({
			patterns: [
				{
					from: '../node_modules/typescript/lib/*.d.ts',
					to: 'typescript/[name][ext]',
				},
				{
					from: '../node_modules/typescript/lib/typesMap.json',
					to: 'typescript/'
				},
				...languages.map(lang => ({
					from: `../node_modules/typescript/lib/${lang}/**/*`,
					to: (pathData) => {
						const normalizedFileName = pathData.absoluteFilename.replace(/[\\/]/g, '/');
						const match = normalizedFileName.match(/typescript\/lib\/(.*)/);
						if (match) {
							return `typescript/${match[1]}`;
						}
						console.log(`Did not find typescript/lib in ${normalizedFileName}`);
						return 'typescript/';
					}
				}))
			],
		}),
	],
}), withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		'typescript/tsserver.web': './web/src/webServer.ts'
	},
	module: {
		exprContextCritical: false,
	},
	ignoreWarnings: [/Critical dependency: the request of a dependency is an expression/],
	output: {
		// all output goes into `dist`.
		// packaging depends on that and this must always be like it
		filename: '[name].js',
		path: path.join(import.meta.dirname, 'dist', 'browser'),
		libraryTarget: undefined,
	},
	externals: {
		'perf_hooks': 'commonjs perf_hooks',
	}
})];
