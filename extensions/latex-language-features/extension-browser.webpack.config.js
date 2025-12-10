/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import CopyPlugin from 'copy-webpack-plugin';
import { browser as withBrowserDefaults, browserPlugins } from '../shared.webpack.config.mjs';

export default withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.browser.ts',
	},
	resolve: {
		fallback: {
			'child_process': false
			// Note: util, path, os are already handled by withBrowserDefaults
		}
	},
	plugins: [
		...browserPlugins(import.meta.dirname), // add plugins, don't replace inherited
		// Copy data files to dist/browser/data for web access
		new CopyPlugin({
			patterns: [
				{
					from: 'data',
					to: 'data',
					noErrorOnMissing: true
				}
			],
		}),
	],
});

