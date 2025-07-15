/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withBrowserDefaults = require('../shared.webpack.config').browser;
const path = require('path');

const mainConfig = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/ipynbMain.browser.ts'
	},
	output: {
		filename: 'ipynbMain.browser.js',
		path: path.join(__dirname, 'dist', 'browser')
	}
});


const workerConfig = withBrowserDefaults({
	context: __dirname,
	entry: {
		notebookSerializerWorker: './src/notebookSerializerWorker.web.ts',
	},
	output: {
		filename: 'notebookSerializerWorker.js',
		path: path.join(__dirname, 'dist', 'browser'),
		libraryTarget: 'var',
		library: 'serverExportVar'
	},
});

module.exports = [mainConfig, workerConfig];
