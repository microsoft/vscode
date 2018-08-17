/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const sharedConfig = require('../shared.webpack.config');

const myConfig = {
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		'vscode': 'commonjs vscode', // ignored because it doesn't exist
		'@emmetio/css-parser': 'commonjs @emmetio/css-parser',
		'@emmetio/html-matcher': 'commonjs @emmetio/html-matcher',
		'@emmetio/math-expression': 'commonjs @emmetio/math-expression',
		'image-size': 'commonjs image-size',
		'vscode-emmet-helper': 'commonjs vscode-emmet-helper',
	},
};

module.exports = { ...sharedConfig(__dirname), ...myConfig };
