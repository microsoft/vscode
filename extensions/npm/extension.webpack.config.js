/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import withDefaults from '../shared.webpack.config.mjs';

export default withDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/npmMain.ts',
	},
	output: {
		filename: 'npmMain.js',
	},
	resolve: {
		mainFields: ['module', 'main'],
		extensions: ['.ts', '.js'] // support ts-files and js-files
	}
});
