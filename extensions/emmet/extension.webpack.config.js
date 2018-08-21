/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		'@emmetio/css-parser': 'commonjs @emmetio/css-parser',
		'@emmetio/html-matcher': 'commonjs @emmetio/html-matcher',
		'@emmetio/math-expression': 'commonjs @emmetio/math-expression',
		'image-size': 'commonjs image-size',
		'vscode-emmet-helper': 'commonjs vscode-emmet-helper',
	},
});
