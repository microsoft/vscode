/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts'
	},
	externals: {
		'keytar': 'commonjs keytar',
		'./msal-node-runtime': 'commonjs ./msal-node-runtime'
	},
	plugins: [
		...withDefaults.nodePlugins(__dirname),
		new CopyWebpackPlugin({
			patterns: [
				{
					from: '**/dist/msal*.(node|dll)',
					to: '[name][ext]',
				}
			]
		})
	]
});
