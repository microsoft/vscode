/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withBrowserDefaults = require('../../shared.webpack.config').browser;
const path = require('path');

module.exports = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/browser/cssServerWorkerMain.ts',
	},
	output: {
		filename: 'cssServerMain.js',
		path: path.join(__dirname, 'dist', 'browser'),
		libraryTarget: 'var',
		library: 'serverExportVar'
	}
});
