/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Computes the patch version for the build based on the package.json version
 * and the BUILD_ID environment variable.
 * 
 * This creates a unique, auto-incrementing patch number for each build that
 * resets when the major.minor version changes.
 * 
 * The patch number is computed as: (BUILD_ID % 100000)
 * This ensures uniqueness while keeping the number reasonably sized.
 */
function main() {
	const buildId = process.env.BUILD_ID || process.env.BUILD_BUILDID;
	
	if (!buildId) {
		console.error('Error: BUILD_ID or BUILD_BUILDID environment variable must be set');
		process.exit(1);
	}

	const repoRoot = path.join(__dirname, '../../..');
	const packageJsonPath = path.join(repoRoot, 'package.json');

	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const version = packageJson.version;

	// Extract major.minor version
	const versionParts = version.split('.');
	if (versionParts.length < 2) {
		console.error(`Error: Invalid version format in package.json: ${version}`);
		process.exit(1);
	}

	const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
	
	// Compute patch number from build ID
	// Using modulo to keep the number reasonable
	const patchNumber = parseInt(buildId, 10) % 100000;

	console.log(`[compute-patch-version] Base version from package.json: ${majorMinor}`);
	console.log(`[compute-patch-version] Build ID: ${buildId}`);
	console.log(`[compute-patch-version] Computed patch number: ${patchNumber}`);
	
	// Output the patch number
	console.log(patchNumber);
}

main();
