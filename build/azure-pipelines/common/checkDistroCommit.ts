/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import fs from 'fs';
import { retry } from './retry.ts';

const root = path.dirname(path.dirname(path.dirname(import.meta.dirname)));

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

interface GitHubBranchResponse {
	commit: {
		sha: string;
	};
}

async function getDistroBranchHead(branch: string, token: string): Promise<string> {
	const url = `https://api.github.com/repos/microsoft/vscode-distro/branches/${encodeURIComponent(branch)}`;

	const response = await fetch(url, {
		headers: {
			'Accept': 'application/vnd.github+json',
			'Authorization': `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'VSCode Build'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch branch ${branch} from vscode-distro: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as GitHubBranchResponse;
	return data.commit.sha;
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

	// Get the GitHub token
	const token = getEnv('GITHUB_TOKEN');

	// Fetch the HEAD of the matching branch in vscode-distro
	let distroBranchHead: string;
	try {
		distroBranchHead = await retry(() => getDistroBranchHead(branch, token));
	} catch (error) {
		// If the branch doesn't exist in distro, that's expected for feature branches
		console.log(`Could not fetch branch '${branch}' from vscode-distro: ${error}`);
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
