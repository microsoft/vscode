/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		ipynbMain: './src/ipynbMain.ts',
		notebookSerializerWorker: './src/notebookSerializerWorker.ts',
	},
	output: {
		// filename: 'ipynbMain.js'
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js'
	},
	plugins: [
		...withDefaults.nodePlugins(__dirname), // add plugins, don't replace inherited
	]
});
