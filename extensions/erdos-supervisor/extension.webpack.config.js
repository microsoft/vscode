/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const withDefaults = require('../shared.webpack.config');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	node: {
		__dirname: false
	},
	externals: {
		'bufferutil': 'commonjs bufferutil',
		'utf-8-validate': 'commonjs utf-8-validate'
	}
});
