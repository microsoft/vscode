/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';
const path = require('path');
const withDefaults = require('../shared.webpack.config');

module.exports = withDefaults({
	context: __dirname,
	target: 'webworker',
	node: false,
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		alias: {
			'node-fetch': path.resolve(__dirname, 'node_modules/node-fetch/browser.js'),
		},
	}
});
