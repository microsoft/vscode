/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Usage: node script/build/vscodeDtsUpdate.js
// Copies proposed API d.ts files from the repo's src/vscode-dts/ directory
// into this extension's src/extension/ folder based on enabledApiProposals.

const { execSync } = require('child_process');
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

	let copied = 0;
	for (const proposal of proposals) {
		const fileName = `vscode.proposed.${proposal}.d.ts`;
		const sourcePath = path.join(vscodeDtsDir, fileName);
		if (!fs.existsSync(sourcePath)) {
			console.warn(`Warning: ${fileName} not found in src/vscode-dts/`);
			continue;
		}
		fs.copyFileSync(sourcePath, path.join(targetDir, fileName));
		copied++;
	}
	console.log(`Copied ${copied} proposed API type definitions from src/vscode-dts/.`);

	// Write the current commit SHA to package.json for reference
	const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
	const pkgPath = path.resolve('package.json');
	pkg.vscodeCommit = sha;
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
	console.log(`Wrote vscodeCommit: ${sha} to package.json`);
}

main();
