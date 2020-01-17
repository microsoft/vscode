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
	externals: {
		'typescript-vscode-sh-plugin': 'commonjs vscode' // used by build/lib/extensions to know what node_modules to bundle
	},
	entry: {
		extension: './src/extension.ts',
	}
});
