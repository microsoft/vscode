/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import withDefaults from '../../shared.webpack.config.mjs';
import path from 'path';

export default withDefaults({
	context: path.join(import.meta.dirname),
	entry: {
		extension: './src/node/htmlServerNodeMain.ts',
	},
	output: {
		filename: 'htmlServerMain.js',
		path: path.join(import.meta.dirname, 'dist', 'node'),
	},
	externals: {
		'typescript': 'commonjs typescript'
	}
});
