/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');

const clientConfig = withDefaults({
	context: __dirname,
	target: 'webworker',
	entry: {
		extension: './src/extension.ts'
	},
	resolve: {
		alias: {
			'vscode-extension-telemetry': path.resolve(__dirname, '../../build/polyfills/vscode-extension-telemetry.js'),
			'vscode-nls': path.resolve(__dirname, '../../build/polyfills/vscode-nls.js'),
		},
	}
});

clientConfig.module.rules[0].use.shift(); // remove nls loader

module.exports =  clientConfig;
