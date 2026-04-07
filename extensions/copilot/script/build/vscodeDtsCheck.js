/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Usage: node script/build/vscodeDtsCheck.js
// Reads vscodeCommit from package.json, re-downloads proposed d.ts files
// at that commit, checks if any differ from what's committed, then restores
// the originals. Exits with code 1 if files are out of date.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = path.resolve('src', 'extension');

function main() {
	const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
	const sha = pkg.vscodeCommit;
	if (!sha) {
		console.error('No vscodeCommit found in package.json. Run "npm run vscode-dts:update" first.');
		process.exit(1);
	}

	console.log(`Checking proposed d.ts files against vscodeCommit: ${sha}`);

	// Download proposed d.ts files using the commit SHA
	execSync(`node node_modules/@vscode/dts/index.js dev ${sha}`, { stdio: 'inherit' });

	// Compare downloaded files with committed ones
	const downloaded = fs.readdirSync('.').filter(f => f.startsWith('vscode.') && f.endsWith('.ts'));
	const mismatched = [];

	for (const f of downloaded) {
		const committedPath = path.join(targetDir, f);
		const newContent = fs.readFileSync(f, 'utf-8');

		if (!fs.existsSync(committedPath)) {
			mismatched.push(f + ' (missing)');
		} else {
			const oldContent = fs.readFileSync(committedPath, 'utf-8');
			if (oldContent !== newContent) {
				mismatched.push(f);
			}
		}

		// Clean up the downloaded file
		fs.unlinkSync(f);
	}

	if (mismatched.length > 0) {
		console.error('The following proposed API type definitions are out of date:');
		for (const f of mismatched) {
			console.error(`  - ${f}`);
		}
		console.error('Run "npm run vscode-dts:update" and commit the changes.');
		process.exit(1);
	}

	console.log('All proposed API type definitions are up to date.');
}

main();
