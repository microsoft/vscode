/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';
import { browser as withBrowserDefaults } from '../shared.webpack.config.mjs';

export default withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/configurationEditingMain.ts'
	},
	output: {
		filename: 'configurationEditingMain.js'
	},
	resolve: {
		alias: {
			'./node/net': path.resolve(import.meta.dirname, 'src', 'browser', 'net'),
		}
	}
});

