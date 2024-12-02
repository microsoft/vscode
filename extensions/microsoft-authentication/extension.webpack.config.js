/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

const isWindows = process.platform === 'win32';

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts'
	},
	externals: {
		// The @azure/msal-node-runtime package requires this native node module (.node).
		// It is currently only included on Windows, but the package handles unsupported platforms
		// gracefully.
		'./msal-node-runtime': 'commonjs ./msal-node-runtime'
	},
	resolve: {
		alias: {
			'keytar': path.resolve(__dirname, 'packageMocks', 'keytar', 'index.js')
		}
	},
	plugins: [
		...withDefaults.nodePlugins(__dirname),
		new CopyWebpackPlugin({
			patterns: [
				{
					// The native files we need to ship with the extension
					from: '**/dist/msal*.(node|dll)',
					to: '[name][ext]',
					// These will only be present on Windows for now
					noErrorOnMissing: !isWindows
				}
			]
		})
	]
});
