/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withBrowserDefaults = require('../shared.webpack.config').browser;

const config = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/ipynbMain.browser.ts'
	},
	output: {
		filename: 'ipynbMain.browser.js'
	}
});

module.exports = config;
