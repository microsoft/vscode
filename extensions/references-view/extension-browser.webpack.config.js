/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withBrowserDefaults = require('../shared.webpack.config').browser;
const path = require('path');

module.exports = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts'
	},
	output: {
		filename: 'extension.js',
		path: path.join(__dirname, 'dist')
	}
});
