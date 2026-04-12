/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Usage: node script/build/vscodeDtsCheck.js
// Compares proposed d.ts files in src/extension/ against the repo's
// src/vscode-dts/ directory. Exits with code 1 if files are out of date.

const fs = require('fs');
const path = require('path');

const vscodeDtsDir = path.resolve('..', '..', 'src', 'vscode-dts');
const targetDir = path.resolve('src', 'extension');

function main() {
	const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
	const proposals = pkg.enabledApiProposals;
	if (!proposals || proposals.length === 0) {
		console.error('No enabledApiProposals found in package.json.');
		process.exit(1);
	}

	console.log('Checking proposed d.ts files against src/vscode-dts/...');

	const mismatched = [];

	for (const proposal of proposals) {
		const fileName = `vscode.proposed.${proposal}.d.ts`;
		const sourcePath = path.join(vscodeDtsDir, fileName);
		const committedPath = path.join(targetDir, fileName);

		if (!fs.existsSync(sourcePath)) {
			console.warn(`Warning: ${fileName} not found in src/vscode-dts/, skipping`);
			continue;
		}

		const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

		if (!fs.existsSync(committedPath)) {
			mismatched.push(fileName + ' (missing)');
		} else {
			const committedContent = fs.readFileSync(committedPath, 'utf-8');
			if (sourceContent !== committedContent) {
				mismatched.push(fileName);
			}
		}
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
