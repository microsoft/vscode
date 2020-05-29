/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');
const webpack = require('webpack');

const vscodeNlsReplacement = new webpack.NormalModuleReplacementPlugin(
	/vscode\-nls\/lib\/main\.js/,
	path.join(__dirname, 'client/out/browser/vscodeNlsShim.js')
);

const clientConfig = withDefaults({
	target: 'webworker',
	context: path.join(__dirname, 'client'),
	entry: {
		extension: './src/browser/cssClientMain.ts'
	},
	output: {
		filename: 'cssClientMain.js',
		path: path.join(__dirname, 'client', 'dist', 'browser')
	}
});
clientConfig.plugins[1] = vscodeNlsReplacement; // replace nls bundler
clientConfig.module.rules[0].use.shift(); // remove nls loader

const serverConfig = withDefaults({
	target: 'webworker',
	context: path.join(__dirname, 'server'),
	entry: {
		extension: './src/browser/cssServerMain.ts',
	},
	output: {
		filename: 'cssServerMain.js',
		path: path.join(__dirname, 'server', 'dist', 'browser'),
		libraryTarget: 'var'
	}
});
serverConfig.plugins[1] = vscodeNlsReplacement; // replace nls bundler
serverConfig.module.rules[0].use.shift(); // remove nls loader

module.exports = [clientConfig, serverConfig];
