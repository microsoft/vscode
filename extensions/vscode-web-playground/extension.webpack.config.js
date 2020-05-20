/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

'use strict';
const path = require('path');
const withDefaults = require('../shared.webpack.config');

module.exports = function (env, argv) {
	const mode = argv.mode;

	/**@type WebpackConfig*/
	const config = {
		context: __dirname,
		target: 'webworker',
		node: false,
		resolve: {
			alias: {
				'node-fetch': path.resolve(__dirname, 'node_modules/node-fetch/browser.js'),
			},
		},
		entry: {
			extension: './src/extension.ts',
		},
	};

	if (mode === 'none') {
		// Set the output to `out` when there is no mode (e.g. not production)
		config.output = {
			path: path.join(__dirname, 'out'),
		};
	}

	return withDefaults(config);
};
