/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');

/**
 * Function that must be invoked with __dirname and that
 * returns a good default configuation for extensions that
 * want to do webpack
 */
module.exports = function (extensionDir) {
	return {
		context: extensionDir,
		mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
		target: 'node', // extensions run in a node context
		resolve: {
			mainFields: ['main'], // prefer the main-entry of package.json files
			extensions: ['.ts', '.js'] // support ts-files and js-files
		},
		module: {
			rules: [{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [{
					// vscode-nls-dev loader:
					// * rewrite nls-calls
					loader: 'vscode-nls-dev/lib/webpack-loader'
				}, {
					// configure TypeScript loader:
					// * only transpile because we have a separate compilation pipeline
					// * enable sources maps for end-to-end source maps
					loader: 'ts-loader',
					options: {
						transpileOnly: true,
						compilerOptions: {
							"sourceMap": true,
						}
					}
				}]
			}]
		},
		output: {
			// all output goes into `dist`.
			// packaging depends on that and this must always be like it
			filename: '[name].js',
			path: path.join(extensionDir, 'dist'),
			libraryTarget: "commonjs",
		},
		// yes, really source maps
		devtool: 'source-map'
	};
};
