/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const withBrowserDefaults = require('../shared.webpack.config').browser;

module.exports = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/configurationEditingMain.ts'
	},
	output: {
		filename: 'configurationEditingMain.js'
	},
	resolve: {
		alias: {
			'./node/net': path.resolve(__dirname, 'src', 'browser', 'net'),
		}
	}
});

