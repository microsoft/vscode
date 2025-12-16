/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { browser as withBrowserDefaults, browserPlugins } from '../shared.webpack.config.mjs';

const baseConfig = withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		fallback: {
			'child_process': false,
			'fs': false,
			'path': false
		}
	},
	plugins: [
		...browserPlugins(import.meta.dirname),
	],
});

export default baseConfig;

