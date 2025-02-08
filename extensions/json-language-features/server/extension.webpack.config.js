/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../../shared.webpack.config');
const path = require('path');

const config = withDefaults({
	context: path.join(__dirname),
	entry: {
		extension: './src/node/jsonServerNodeMain.ts',
	},
	output: {
		filename: 'jsonServerMain.js',
		path: path.join(__dirname, 'dist', 'node'),
	}
});

module.exports = config;
