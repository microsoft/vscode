/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const withBrowserDefaults = require('../shared.webpack.config').browser;

module.exports = withBrowserDefaults({
	context: __dirname,
	node: {
		global: true,
		__filename: false,
		__dirname: false,
	},
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		'keytar': 'commonjs keytar'
	},
	resolve: {
		alias: {
			'./env/node': path.resolve(__dirname, 'src/env/browser'),
			'./authServer': path.resolve(__dirname, 'src/env/browser/authServer'),
		}
	}
});
