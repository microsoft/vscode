/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { retry, handleAll, ExponentialBackoff } from 'cockatiel';
import { execSync } from 'child_process';

const MARKETPLACE_EXTENSION_NAME = 'GitHub.copilot-chat';
const MARKETPLACE_API_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

interface IMarketplaceQueryResult {
	readonly results: {
		readonly extensions: {
			readonly versions: {
				readonly version: string;
			}[];
		}[];
	}[];
}

const retryPolicy = retry(handleAll, {
	maxAttempts: 5,
	backoff: new ExponentialBackoff()
});

async function queryMarketplaceVersions(extensionName: string): Promise<string[]> {
	console.log(`Querying Marketplace for versions of ${extensionName}...`);

	const body = JSON.stringify({
		filters: [{
			criteria: [
				{ filterType: 7 /* ExtensionName */, value: extensionName },
			],
		}],
		flags: 0x1 /* IncludeVersions */
	});

	const response = await retryPolicy.execute((context) => {
		if (context.attempt > 0) {
			console.log(`Retrying Marketplace query (attempt ${context.attempt + 1})...`);
		}
		return fetch(MARKETPLACE_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json;api-version=3.0-preview.1',
				'User-Agent': 'VS Code Build',
			},
			body
		});
	});

	if (!response.ok) {
		throw new Error(`Marketplace query failed: ${response.status} ${response.statusText}`);
	}

	const result: IMarketplaceQueryResult = await response.json();
	const extensions = result.results?.[0]?.extensions;

	if (!extensions?.length) {
		console.log('No extensions found in Marketplace response');
		return [];
	}

	const versions = extensions[0].versions.map(v => v.version);
	console.log(`Found ${versions.length} published version(s)`);
	return versions;
}

function getHighestPatch(versions: string[], major: number, minor: number): number {
	let highest = 0;
	const matching: string[] = [];

	for (const version of versions) {
		const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
		if (!match) {
			continue;
		}

		const [, vMajor, vMinor, vPatch] = match;
		if (parseInt(vMajor) === major && parseInt(vMinor) === minor) {
			matching.push(version);
			highest = Math.max(highest, parseInt(vPatch));
		}
	}

	if (matching.length) {
		console.log(`Found ${matching.length} version(s) matching ${major}.${minor}.x: ${matching.join(', ')}`);
		console.log(`Highest patch: ${highest}`);
	} else {
		console.log(`No existing versions found for ${major}.${minor}.x`);
	}

	return highest;
}

function getMostRecentReleaseBranch(): { major: number; minor: number } {
	console.log('Looking for most recent release/* branch...');
	const output = execSync('git branch -r --list "origin/release/*" --sort=-version:refname', { encoding: 'utf8' });

	for (const line of output.split('\n')) {
		const match = /origin\/release\/(\d+)\.(\d+)/.exec(line.trim());
		if (match) {
			console.log(`Most recent release branch: release/${match[1]}.${match[2]}`);
			return { major: parseInt(match[1]), minor: parseInt(match[2]) };
		}
	}

	throw new Error('No release/* branches found');
}

async function main() {
	const sourceBranch = process.env['BUILD_SOURCEBRANCH'] ?? '';
	console.log(`Source branch: ${sourceBranch || '(not set)'}`);

	const releaseBranchMatch = /^refs\/heads\/release\/(\d+)\.(\d+)$/.exec(sourceBranch);

	let major: number;
	let minor: number;
	let patch: number;

	if (releaseBranchMatch) {
		major = parseInt(releaseBranchMatch[1]);
		minor = parseInt(releaseBranchMatch[2]);
		console.log(`On release branch: ${major}.${minor}`);

		const versions = await queryMarketplaceVersions(MARKETPLACE_EXTENSION_NAME);
		const highestPatch = getHighestPatch(versions, major, minor);
		patch = highestPatch + 1;
		console.log(`Next patch version: ${patch}`);
	} else {
		console.log('Not on a release branch, looking up most recent release branch...');
		const { major: m, minor: n } = getMostRecentReleaseBranch();
		major = m;
		minor = n;
		patch = 0;
	}

	const version = `${major}.${minor}.${patch}`;
	console.log(`Computed version: ${version}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
