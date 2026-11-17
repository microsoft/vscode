/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { retry } from '../common/retry.ts';

// Decides whether a CI build checks the macOS universal app (see product-build-darwin-universal-ci.yml),
// which only the macOS (UNIVERSAL) job of the product build checked before: when a commit that the build
// adds can change how the x64 and arm64 clients are packaged or merged. Without a list of those commits,
// for example for a build of the same commit again, or when the list cannot be read, it checks the app.
// Uses only Node built-ins, so it runs before any installation.

/** The files whose changes can affect the packaging or the merge of the x64 and arm64 clients. */
const affectingFiles = [
	// The packaging of the client, and its dependencies, whose native modules and files the merge compares
	/^build\/gulpfile\.vscode\.ts$/,
	/^build\/lib\/asar\.ts$/,
	/^build\/darwin\//,
	/^build\/azure-pipelines\/darwin\//,
	/^(?:build\/)?(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/,
	/^\.pnpmfile\.mjs$/,
];

export function affectsUniversalApp(file: string): boolean {
	return affectingFiles.some(pattern => pattern.test(file));
}

async function getBuildCommits(): Promise<string[]> {
	const { SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT, BUILD_BUILDID, SYSTEM_ACCESSTOKEN } = process.env;
	if (!SYSTEM_COLLECTIONURI || !SYSTEM_TEAMPROJECT || !BUILD_BUILDID || !SYSTEM_ACCESSTOKEN) {
		throw new Error('Missing SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT, BUILD_BUILDID or SYSTEM_ACCESSTOKEN');
	}
	// The commits since the previous build of the branch
	const res = await fetch(`${SYSTEM_COLLECTIONURI.replace(/\/?$/, '/')}${encodeURIComponent(SYSTEM_TEAMPROJECT)}/_apis/build/builds/${BUILD_BUILDID}/changes?$top=100&api-version=7.1`, {
		headers: { Authorization: `Bearer ${SYSTEM_ACCESSTOKEN}` },
		signal: AbortSignal.timeout(2 * 60 * 1000),
	});
	if (!res.ok) {
		throw new Error(`Unexpected status code: ${res.status}`);
	}
	const { value } = await res.json() as { readonly value: readonly { readonly id: string; readonly type: string }[] };
	return value.filter(change => /^[0-9a-f]{40}$/.test(change.id)).map(change => change.id);
}

/** The files that the commits change, from a shallow clone of the build's commit. */
function getChangedFiles(head: string, commits: readonly string[]): string[] {
	// The commits and their parents, which the checkout (fetchDepth 1) doesn't have
	execFileSync('git', ['fetch', '--no-tags', `--depth=${commits.length + 1}`, 'origin', head], { stdio: 'inherit' });
	return commits.flatMap(commit => execFileSync('git', ['diff-tree', '-r', '-m', '--no-commit-id', '--name-only', commit], { encoding: 'utf8' }).split('\n').filter(Boolean));
}

async function main(): Promise<void> {
	let affected = true;
	try {
		const head = process.env.BUILD_SOURCEVERSION;
		if (!head) {
			throw new Error('Missing BUILD_SOURCEVERSION');
		}
		const commits = await retry(() => getBuildCommits());
		// The changes API lists at most 100 commits
		if (commits.length === 0 || commits.length >= 100) {
			console.log(`The build adds ${commits.length || 'no'} commits, so it checks the universal app.`);
		} else {
			const files = getChangedFiles(head, commits).filter(affectsUniversalApp);
			affected = files.length > 0;
			console.log(affected
				? `These changes of the ${commits.length} commits of the build can affect the universal app:\n${[...new Set(files)].map(file => `  ${file}`).join('\n')}`
				: `No change of the ${commits.length} commits of the build can affect the universal app.`);
		}
	} catch (err) {
		console.log(`##vso[task.logissue type=warning]Could not list the changes of the build, so it checks the universal app: ${err instanceof Error ? err.message : String(err)}`);
	}
	console.log(`##vso[task.setvariable variable=AFFECTED;isOutput=true]${affected}`);
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exitCode = 1;
	});
}
