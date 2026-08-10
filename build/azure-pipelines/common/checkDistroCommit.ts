/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const root = path.dirname(path.dirname(path.dirname(import.meta.dirname)));

// The microsoft/vscode-distro repository is checked out locally by
// download-distro.yml (into .build/distro) using the agent's GitHub App
// (Monaco) credentials, so we can resolve branch heads without a token that
// has private repository access.
const distroPath = path.join(root, '.build', 'distro');

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

function assertDistroCheckout(): void {
	if (!fs.existsSync(path.join(distroPath, '.git'))) {
		throw new Error(`Expected a vscode-distro checkout at ${distroPath} but found none. Ensure download-distro.yml ran before this check.`);
	}
}

function getDistroBranchHead(branch: string): string {
	return execSync(`git -C "${distroPath}" rev-parse "refs/remotes/origin/${branch}"`, { encoding: 'utf8' }).trim();
}

async function checkDistroCommit(): Promise<void> {
	// Get the distro commit from package.json
	const packageJsonPath = path.join(root, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	const distroCommit: string = packageJson.distro;

	if (!distroCommit) {
		console.log('No distro commit found in package.json, skipping check');
		return;
	}

	console.log(`Distro commit in package.json: ${distroCommit}`);

	// Get the current branch from Azure DevOps
	// BUILD_SOURCEBRANCH is in format refs/heads/main or refs/heads/release/1.90
	const sourceBranch = getEnv('BUILD_SOURCEBRANCH');
	const branchMatch = sourceBranch.match(/^refs\/heads\/(.+)$/);

	if (!branchMatch) {
		console.log(`Cannot determine branch from BUILD_SOURCEBRANCH: ${sourceBranch}, skipping check`);
		return;
	}

	const branch = branchMatch[1];
	console.log(`Current branch: ${branch}`);

	// Make sure the distro repository is actually checked out before we try to
	// resolve a branch head from it; otherwise a missing checkout would be
	// indistinguishable from a branch that simply doesn't exist in distro.
	assertDistroCheckout();

	// Resolve the HEAD of the matching branch from the local distro checkout
	let distroBranchHead: string;
	try {
		distroBranchHead = getDistroBranchHead(branch);
	} catch (error) {
		// If the branch doesn't exist in distro, that's expected for feature branches
		console.log(`Could not resolve branch '${branch}' from local vscode-distro checkout: ${error}`);
		console.log('This is expected for feature branches that have not been merged to distro');
		return;
	}

	console.log(`Distro branch '${branch}' HEAD: ${distroBranchHead}`);

	// Compare the commits
	if (distroCommit === distroBranchHead) {
		console.log(`✓ Distro commit matches branch HEAD`);
	} else {
		// Issue a warning using Azure DevOps logging commands
		console.log(`##vso[task.logissue type=warning]Distro commit mismatch: package.json has ${distroCommit.substring(0, 8)} but ${branch} HEAD is ${distroBranchHead.substring(0, 8)}`);
		console.log(`##vso[task.complete result=SucceededWithIssues;]Distro commit does not match branch HEAD`);
		console.log('');
		console.log(`⚠️  WARNING: Distro commit in package.json does not match the HEAD of branch '${branch}' in vscode-distro`);
		console.log(`   package.json distro: ${distroCommit}`);
		console.log(`   ${branch} HEAD:      ${distroBranchHead}`);
		console.log('');
		console.log('   To update, run: npm run update-distro');
	}
}

checkDistroCommit().then(() => {
	console.log('Distro commit check completed');
	process.exit(0);
}, err => {
	console.error(err);
	process.exit(1);
});
