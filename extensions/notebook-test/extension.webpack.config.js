/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');

module.exports = [
	withDefaults({
		context: __dirname,
		resolve: {
			mainFields: ['module', 'main']
		},
		entry: {
			extension: './src/extension.ts',
		},
		externals: {
			"mathjax-node": "mathjax-node"
		}
	}),
	{
		entry: './output/ipywidgets.js',
		output: {
			filename: 'ipywidgets.js',
			publicPath: 'dist/'
		},
		target: 'web',
		module: {
			rules: [
				{ test: /\.css$/, loader: "style-loader!css-loader" }
			]
		},
	}
]
