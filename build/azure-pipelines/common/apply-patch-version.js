/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Updates package.json with an auto-incremented patch version.
 * This script is used during Insider builds to ensure each build has a unique version.
 * 
 * Usage: node apply-patch-version.js <patch-number>
 * Example: node apply-patch-version.js 42
 * 
 * This will transform version "1.107.0" to "1.107.42"
 */
function main() {
	const patchNumber = process.argv[2];
	
	if (!patchNumber || !/^\d+$/.test(patchNumber)) {
		console.error('Error: Patch number must be provided as a positive integer');
		console.error('Usage: node apply-patch-version.js <patch-number>');
		process.exit(1);
	}

	const repoRoot = path.join(__dirname, '../../..');
	const packageJsonPath = path.join(repoRoot, 'package.json');

	console.log(`[apply-patch-version] Reading package.json from: ${packageJsonPath}`);
	
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const originalVersion = packageJson.version;

	console.log(`[apply-patch-version] Original version: ${originalVersion}`);

	// Parse the version (e.g., "1.107.0")
	const versionParts = originalVersion.split('.');
	
	if (versionParts.length !== 3) {
		console.error(`Error: Expected version format "major.minor.patch", got "${originalVersion}"`);
		process.exit(1);
	}

	// Update the patch version
	versionParts[2] = patchNumber;
	const newVersion = versionParts.join('.');

	packageJson.version = newVersion;

	console.log(`[apply-patch-version] New version: ${newVersion}`);

	// Write the updated package.json back
	fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

	console.log(`[apply-patch-version] Successfully updated package.json`);
}

main();
