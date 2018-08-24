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
		__dirname: false // leave the __dirname-behaviour intact
	},
	entry: {
		main: './src/main.ts',
		['askpass-main']: './src/askpass-main.ts'
	},
	plugins: [
		new CopyWebpackPlugin([
			{ from: './out/*.sh', to: '[name].sh' },
			{ from: './out/nls.*.json', to: '[name].json' }
		])
	]
});
