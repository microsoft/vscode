/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');

module.exports = withDefaults({
	context: __dirname,
	resolve: {
		mainFields: ['module', 'main']
	},
	entry: {
		extension: './client/src/jsonMain.ts',
	},
	externals: {
		'vscode-extension-telemetry': 'commonjs vscode-extension-telemetry',
		'vscode-nls': 'commonjs vscode-nls',
	},
});
