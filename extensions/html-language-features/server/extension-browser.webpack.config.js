/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { browser as withBrowserDefaults } from '../../shared.webpack.config.mjs';
import path from 'path';

const serverConfig = withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/browser/htmlServerWorkerMain.ts',
	},
	resolve: {
		extensionAlias: {
			// this is needed to resolve dynamic imports that now require the .js extension
			'.js': ['.js', '.ts'],
		},
	},
	output: {
		filename: 'htmlServerMain.js',
		path: path.join(import.meta.dirname, 'dist', 'browser'),
		libraryTarget: 'var',
		library: 'serverExportVar'
	},
	optimization: {
		splitChunks: {
			chunks: 'async'
		}
	}
});
serverConfig.module.noParse = /typescript[\/\\]lib[\/\\]typescript\.js/;
serverConfig.module.rules.push({
	test: /javascriptLibs.ts$/,
	use: [
		{
			loader: path.resolve(import.meta.dirname, 'build', 'javaScriptLibraryLoader.js')
		}
	]
});

export default serverConfig;
