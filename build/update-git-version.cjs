/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file
/**
 * Update git version information in product.json
 * Get the latest git tag or commit hash and write to product.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitVersion() {
	try {
		// Try to get the latest git tag (sorted by version number)
		const tag = execSync('git tag -l --sort=-version:refname', { encoding: 'utf8' }).trim().split('\n')[0];
		if (tag) {
			return tag;
		}
		// If no tag exists, use commit hash
		const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
		return `dev-${commit}`;
	} catch (error) {
		// If error occurs, use commit hash
		try {
			const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
			return `dev-${commit}`;
		} catch (commitError) {
			console.warn('Unable to get git version info:', commitError.message);
			return 'unknown';
		}
	}
}

function getGitCommitHash() {
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
	} catch (error) {
		console.warn('Unable to get git commit hash:', error.message);
		return 'unknown';
	}
}

function getGitCommitDate() {
	try {
		return execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim();
	} catch (error) {
		console.warn('Unable to get git commit date:', error.message);
		return new Date().toISOString();
	}
}

function updateProductJson() {
	const productJsonPath = path.join(__dirname, '..', 'product.json');

	// Read product.json
	const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));

	// Get git version information
	const gitVersion = getGitVersion();
	const gitCommit = getGitCommitHash();
	const gitDate = getGitCommitDate();

	// Update product.json
	productJson.gitVersion = gitVersion;
	productJson.commit = gitCommit;
	productJson.date = gitDate;

	// Write back to product.json
	fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t') + '\n', 'utf8');

	console.log('✓ Updated product.json:');
	console.log(`  Git Version: ${gitVersion}`);
	console.log(`  Commit: ${gitCommit}`);
	console.log(`  Date: ${gitDate}`);
}

// Execute update
updateProductJson();
