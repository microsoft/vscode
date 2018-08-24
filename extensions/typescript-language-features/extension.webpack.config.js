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
	node: {
		__dirname: false,
	},
	resolve: {
		mainFields: ['module', 'main']
	},
	entry: {
		extension: './src/extension.ts',
	},
	plugins: [
		new CopyWebpackPlugin([
			{ from: './out/nls.*.json', to: '[name].json' }
		])
	]
});
