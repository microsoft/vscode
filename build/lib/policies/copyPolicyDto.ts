/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

const sourceFile = path.join(import.meta.dirname, '../../../src/vs/workbench/contrib/policyExport/common/policyDto.ts');
const destFile = path.join(import.meta.dirname, 'policyDto.ts');

try {
	// Check if source file exists
	if (!fs.existsSync(sourceFile)) {
		console.error(`Error: Source file not found: ${sourceFile}`);
		console.error('Please ensure policyDto.ts exists in src/vs/workbench/contrib/policyExport/common/');
		process.exit(1);
	}

	// Copy the file
	fs.copyFileSync(sourceFile, destFile);
} catch (error) {
	console.error(`Error copying policyDto.ts: ${(error as Error).message}`);
	process.exit(1);
}
