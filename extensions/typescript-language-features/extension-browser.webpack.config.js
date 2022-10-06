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
				{ // TODO: Also want to copy ../node_modules/typescript/lib/typingsInstaller.js to typescript/
					from: '../node_modules/typescript/lib/tsserver.js',
					to: 'typescript/tsserver.web.js',
					transform: async (_content) => {
						const dynamicImportCompatPath = path.join(__dirname, '..', 'node_modules', 'typescript', 'lib', 'dynamicImportCompat.js');
						const cheat = fs.readFileSync('/home/nathansa/ts/built/local/tsserver.js', 'utf8');
						const prefix = fs.existsSync(dynamicImportCompatPath) ? fs.readFileSync(dynamicImportCompatPath) : undefined;
						// TODO: All this extra work can *probably* be done with webpack tools in some way.
						const filenames = {
							'vscode-uri': path.join(__dirname, 'node_modules', 'vscode-uri', 'lib', 'umd', 'index.js'),
							'./vscode': path.join(__dirname, 'node_modules', '@vscode/sync-api-client', 'lib', 'vscode.js'),
							'./apiClient': path.join(__dirname, 'node_modules', '@vscode/sync-api-client', 'lib', 'apiClient.js'),
							'@vscode/sync-api-client': path.join(__dirname, 'node_modules', '@vscode/sync-api-client', 'lib', 'main.js'),
							'./ral': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'common', 'ral.js'),
							'common--./connection': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'common', 'connection.js'), // referenced from common/api.js and /protocol.js
							'./protocol': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'common', 'protocol.js'),
							'browser--./connection': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'browser', 'connection.js'), // referenced from connection.js, main.js, ril.js
							'./ril': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'browser', 'ril.js'),
							'../common/api': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'common', 'api.js'),
							'@vscode/sync-api-common': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'lib', 'browser', 'main.js'),
							'@vscode/sync-api-common/browser': path.join(__dirname, 'node_modules', '@vscode/sync-api-common', 'browser.js'),
							'vscode-wasm-typescript': '/home/nathansa/src/vscode-wasm-typescript/dist/index.js',
						};
						const redirect = {
							'./lib/browser/main': '@vscode/sync-api-common',
							'./lib/common/ral': './ral',
							'../common/ral': './ral',
							'../common/connection': 'common--./connection',
						};
						const connectionReplacements = {
							'@vscode/sync-api-common': 'require("browser--./connection")',
							'./ril': 'require("browser--./connection")',
							'common--./connection': 'require("browser--./connection")',
							'../common/api': 'require("common--./connection")',
							'./protocol': 'require("common--./connection")',
						};
						/** @type {Record<string, string>} */
						const modules = {};
						for (const name in filenames) {
							modules[name] = fs.readFileSync(filenames[name], 'utf8');
							if (name in connectionReplacements) {
								modules[name] = modules[name].replace('require("./connection")', connectionReplacements[name]);
							}
						}
						return prefix + '\n' + cheat + '\n' + wrapper(modules, redirect);
					},
					transformPath: (targetPath) => {
						return targetPath.replace('tsserver.js', 'tsserver.web.js');
					}
				}
			],
		}),
	],
});

/**
 * @param {Record<string, string>} modules
 * @param {Record<string, string>} redirect
 */
function wrapper(modules, redirect) {
	let prog = `
const experts = {
	${Object.keys(modules).map(n => `"${n}": {}`).join(',\n    ')}
};
${Object.keys(redirect).map(n => `experts["${n}"] = experts["${redirect[n]}"];`).join('\n')}
experts["typescript/lib/tsserverlibrary"] = ts;
function requiem(name) {
	if (!(name in experts)) {
		console.log('require missing', name);
		throw new Error('require missing ' + name);
	}
	return experts[name];
}
`;
	for (const name in modules) {
		prog += `
//////////////////////////// ${name} //////////////////////////////////
experts["${name}"] = (function (exports, require, module) {
${modules[name]}
return module.exports;
})(experts["${name}"], requiem, { exports: experts["${name}"] });


`;
	}
	// NOTE: As long as it's OK to have vscode-wasm-typescript run event listener stuff inside
	// If I end up needing async, then the last function will need to be `async function` and the call
	// might need a `.then` postfix, although the one I know is for node
	return prog;
}
