/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';

/** Builds with more commits than this check every file. */
const maxCommits = 1000;

interface BuildContext {
	readonly collectionUri: string;
	readonly projectId: string;
	readonly buildId: string;
	readonly token: string;
}

/**
 * Lists the commits that Azure Pipelines associates with a build. For a CI build, these are the commits since the last
 * successful build of the pipeline on the same branch, so the commits of a failed build are part of the next build.
 */
export async function getBuildCommits(context: BuildContext, fetcher: typeof fetch = fetch): Promise<string[]> {
	const url = new URL(`${encodeURIComponent(context.projectId)}/_apis/build/builds/${encodeURIComponent(context.buildId)}/changes?$top=${maxCommits}&api-version=7.1`, context.collectionUri.replace(/\/?$/, '/'));
	const response = await fetcher(url, {
		headers: { Authorization: `Bearer ${context.token}`, Accept: 'application/json' },
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		throw new Error(`Cannot list the commits of the build: HTTP ${response.status} ${response.statusText}`);
	}
	if (response.headers.has('x-ms-continuationtoken')) {
		throw new Error(`The build has more than ${maxCommits} commits.`);
	}
	const { value } = await response.json() as { readonly value: readonly { readonly id: string }[] };
	return value.map(change => change.id);
}

/**
 * Returns the commit that the commits of a build start from: the closest first-parent ancestor of `head` that is not
 * one of them. The changes between that commit and `head` are the changes of all the commits of the build, including
 * the commits that a merge brings in.
 *
 * @param firstParentHistory The first-parent history of `head`, starting with `head`.
 */
export function findBaseCommit(head: string, commits: readonly string[], firstParentHistory: readonly string[]): string {
	const buildCommits = new Set(commits);
	if (!buildCommits.has(head)) {
		throw new Error(`${head} is not one of the ${commits.length} commits of the build.`);
	}
	const base = firstParentHistory.find(commit => !buildCommits.has(commit));
	if (!base) {
		throw new Error(`The first-parent history of ${head} does not reach a commit before the commits of the build.`);
	}
	return base;
}

function git(args: readonly string[]): string {
	const result = cp.spawnSync('git', args, { encoding: 'utf8' });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
	}
	return result.stdout;
}

/**
 * Sets VSCODE_CHANGED_SINCE to the commit that the commits of the build start from, so that hygiene and ESLint check
 * only the files those commits change. Leaves it unset, so that they check every file, when that commit cannot be
 * determined.
 */
async function main(): Promise<void> {
	const { SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECTID, BUILD_BUILDID, SYSTEM_ACCESSTOKEN } = process.env;
	if (!SYSTEM_COLLECTIONURI || !SYSTEM_TEAMPROJECTID || !BUILD_BUILDID || !SYSTEM_ACCESSTOKEN) {
		throw new Error('Listing the commits of the build requires SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECTID, BUILD_BUILDID and SYSTEM_ACCESSTOKEN.');
	}
	const commits = await getBuildCommits({
		collectionUri: SYSTEM_COLLECTIONURI,
		projectId: SYSTEM_TEAMPROJECTID,
		buildId: BUILD_BUILDID,
		token: SYSTEM_ACCESSTOKEN,
	});

	// The checkout contains only HEAD. Fetch enough of its history to reach the commit before the commits of the build.
	const head = git(['rev-parse', 'HEAD']).trim();
	const depth = commits.length + 1;
	git(['fetch', '--no-tags', `--depth=${depth}`, 'origin', head]);
	const firstParentHistory = git(['rev-list', '--first-parent', `--max-count=${depth}`, head]).split('\n').filter(commit => !!commit);

	const base = findBaseCommit(head, commits, firstParentHistory);
	console.log(`Hygiene and ESLint will check the files that the ${commits.length} commit${commits.length === 1 ? '' : 's'} of the build change since ${base}.`);
	console.log(`##vso[task.setvariable variable=VSCODE_CHANGED_SINCE]${base}`);
}

if (import.meta.main) {
	main().catch(error => {
		console.log(`##vso[task.logissue type=warning]Hygiene and ESLint will check every file: ${error instanceof Error ? error.message : String(error)}`);
	});
}
