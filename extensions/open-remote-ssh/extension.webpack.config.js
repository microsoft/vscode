/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import withDefaults from '../shared.webpack.config.mjs';
import webpack from 'webpack';

const { IgnorePlugin } = webpack;

export default withDefaults({
	context: import.meta.dirname,
	resolve: {
		mainFields: ['module', 'main']
	},
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		vscode: "commonjs vscode",
		bufferutil: "commonjs bufferutil",
		"utf-8-validate": "commonjs utf-8-validate",
	},
	plugins: [
		new IgnorePlugin({
			resourceRegExp: /crypto\/build\/Release\/sshcrypto\.node$/,
		}),
		new IgnorePlugin({
			resourceRegExp: /cpu-features/,
		})
	]
});
