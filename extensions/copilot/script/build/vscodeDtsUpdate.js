/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Usage: node script/build/vscodeDtsUpdate.js [branch]
// Downloads proposed API d.ts files from the given branch (default: main)
// of microsoft/vscode and writes the resolved commit SHA to package.json.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const branch = process.argv[2] || 'main';

function resolveCommitSha(branch) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'api.github.com',
			path: `/repos/microsoft/vscode/commits/${encodeURIComponent(branch)}`,
			headers: { 'User-Agent': 'vscode-copilot-chat', 'Accept': 'application/vnd.github.sha' }
		};
		https.get(options, res => {
			if (res.statusCode !== 200) {
				reject(new Error(`Failed to resolve commit for branch "${branch}": HTTP ${res.statusCode}`));
				return;
			}
			let data = '';
			res.on('data', chunk => data += chunk);
			res.on('end', () => resolve(data.trim()));
		}).on('error', reject);
	});
}

async function main() {
	const sha = await resolveCommitSha(branch);
	console.log(`Resolved branch "${branch}" to commit ${sha}`);

	// Download proposed d.ts files using the commit SHA
	execSync(`node node_modules/@vscode/dts/index.js dev ${sha}`, { stdio: 'inherit' });

	// Move downloaded files to src/extension/
	const files = fs.readdirSync('.').filter(f => f.startsWith('vscode.') && f.endsWith('.ts'));
	for (const f of files) {
		fs.renameSync(f, path.join('src', 'extension', f));
	}

	// Write the commit SHA to package.json
	const pkgPath = path.resolve('package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
	pkg.vscodeCommit = sha;
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
	console.log(`Wrote vscodeCommit: ${sha} to package.json`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
