/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withBrowserDefaults = require('../shared.webpack.config').browser;
const path = require('path');

module.exports = withBrowserDefaults({
	context: __dirname,
	entry: {
		extension: './src/main.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'dist', 'browser')
	},
	resolve: {
		alias: {
			'core': path.resolve(__dirname, 'packages/core/src'),
			'core-browser': path.resolve(__dirname, 'packages/core-browser/src'),
			'editor-core': path.resolve(__dirname, 'packages/editor-core/src'),
			'editor-types': path.resolve(__dirname, 'packages/editor-types/src'),
			'quarto-core': path.resolve(__dirname, 'packages/quarto-core/src')
		}
	}
});

