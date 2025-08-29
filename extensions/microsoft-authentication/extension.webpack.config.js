/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import withDefaults, { nodePlugins } from '../shared.webpack.config.mjs';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';

const arch = process.arch;
console.log(`Building Microsoft Authentication Extension for ${process.platform} (${arch})`);

export default withDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.ts'
	},
	externals: {
		// The @azure/msal-node-runtime package requires this native node module (.node).
		// It is currently only included on Windows, but the package handles unsupported platforms
		// gracefully.
		'./msal-node-runtime': 'commonjs ./msal-node-runtime'
	},
	resolve: {
		alias: {
			'keytar': path.resolve(import.meta.dirname, 'packageMocks', 'keytar', 'index.js')
		}
	},
	plugins: [
		...nodePlugins(import.meta.dirname),
		new CopyWebpackPlugin({
			patterns: [
				{
					// The native files we need to ship with the extension
					from: '**/dist/(lib|)msal*.(node|dll|dylib)',
					to: '[name][ext]',
					noErrorOnMissing: !['win32', 'darwin'].includes(process.platform),
				}
			]
		})
	]
});
