/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { browser as withBrowserDefaults } from '../shared.webpack.config.mjs';
import path from 'path';

export default withBrowserDefaults({
	context: path.join(import.meta.dirname, 'client'),
	entry: {
		extension: './src/browser/cssClientMain.ts'
	},
	output: {
		filename: 'cssClientMain.js',
		path: path.join(import.meta.dirname, 'client', 'dist', 'browser')
	}
});
