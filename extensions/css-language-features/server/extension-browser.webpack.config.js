/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { browser as withBrowserDefaults } from '../../shared.webpack.config.mjs';
import path from 'path';

export default withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/browser/cssServerWorkerMain.ts',
	},
	output: {
		filename: 'cssServerMain.js',
		path: path.join(import.meta.dirname, 'dist', 'browser'),
		libraryTarget: 'var',
		library: 'serverExportVar'
	}
});
