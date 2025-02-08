/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const path = require('path');

const config = withDefaults({
	context: path.join(__dirname, 'client'),
	entry: {
		extension: './src/node/jsonClientMain.ts'
	},
	output: {
		filename: 'jsonClientMain.js',
		path: path.join(__dirname, 'client', 'dist', 'node')
	}
});


module.exports = config;
