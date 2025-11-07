/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';
import { browser as withBrowserDefaults } from '../shared.webpack.config.mjs';

export default withBrowserDefaults({
	context: import.meta.dirname,
	node: {
		global: true,
		__filename: false,
		__dirname: false,
	},
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		alias: {
			'./node/authServer': path.resolve(import.meta.dirname, 'src/browser/authServer'),
			'./node/buffer': path.resolve(import.meta.dirname, 'src/browser/buffer'),
			'./node/fetch': path.resolve(import.meta.dirname, 'src/browser/fetch'),
			'./node/authProvider': path.resolve(import.meta.dirname, 'src/browser/authProvider'),
		}
	}
});
