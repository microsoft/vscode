/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';
const path = require('path');
const withBrowserDefaults = require('../shared.webpack.config').browser;
const webpack = require('webpack');

const config = withBrowserDefaults({
	context: __dirname,
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
config.plugins.push(new webpack.DefinePlugin({ WEBWORKER: JSON.stringify(true) }))

module.exports = config;
