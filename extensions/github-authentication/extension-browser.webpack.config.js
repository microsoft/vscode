/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';
import { browser as withBrowserDefaults } from '../shared.webpack.config.mjs';

export default withBrowserDefaults({
	context: import.meta.dirname,
	node: false,
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		alias: {
			'uuid': path.resolve(import.meta.dirname, 'node_modules/uuid/dist/esm-browser/index.js'),
			'./node/authServer': path.resolve(import.meta.dirname, 'src/browser/authServer'),
			'./node/crypto': path.resolve(import.meta.dirname, 'src/browser/crypto'),
			'./node/fetch': path.resolve(import.meta.dirname, 'src/browser/fetch'),
			'./node/buffer': path.resolve(import.meta.dirname, 'src/browser/buffer'),
		}
	}
});
