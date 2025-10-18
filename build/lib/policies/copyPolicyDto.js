/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, '../../../src/vs/base/common/policyDto.ts');
const destFile = path.join(__dirname, 'policyDto.ts');

try {
	// Check if source file exists
	if (!fs.existsSync(sourceFile)) {
		console.error(`Error: Source file not found: ${sourceFile}`);
		console.error('Please ensure policyDto.ts exists in src/vs/base/common/');
		process.exit(1);
	}

	// Copy the file
	fs.copyFileSync(sourceFile, destFile);
} catch (error) {
	console.error(`Error copying policyDto.ts: ${error.message}`);
	process.exit(1);
}
