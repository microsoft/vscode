/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';

/**
 * Upper bound on concurrent `git rev-parse --show-toplevel` probes when
 * resolving a session's working directories, so a many-folder session cannot
 * spawn an unbounded number of git processes at once.
 */
const REPOSITORY_ROOT_RESOLUTION_CONCURRENCY = 5;

/**
 * The git repository roots and non-git directories that a session's effective
 * working directories resolve to.
 */
export interface ISessionRepositories {
	/**
	 * The UNIQUE git repository roots backing the session's working
	 * directories. Deduplicated with the same case bias the rest of the agent
	 * host uses ({@link extUriBiasedIgnorePathCase}), so several folders rooted
	 * inside one repository contribute a single root. Ordered by the first
	 * contributing working directory, preserving the caller's input order.
	 */
	readonly gitRepositories: URI[];
	/**
	 * The working directories that are not git-backed — their
	 * {@link IAgentHostGitService.getRepositoryRoot} returned `undefined`.
	 * Preserves the caller's input order.
	 */
	readonly nonGitDirectories: URI[];
}

/**
 * Resolves working directories into unique Git repository roots and
 * directories that must be handled without Git.
 *
 * Repository roots are ordered by their first matching input directory and
 * deduplicated using {@link extUriBiasedIgnorePathCase}. Each output array
 * preserves input order even though lookups run concurrently.
 *
 * @example
 * // /work/app/ui  -> /work/app
 * // /work/notes   -> undefined
 * // /work/app/api -> /work/app
 * // /work/tools   -> /work/tools
 * // Result:
 * //   gitRepositories: [/work/app, /work/tools]
 * //   nonGitDirectories: [/work/notes]
 *
 * A lookup error rejects by default. If `onRootError` is provided and returns
 * normally, it receives the error and the failing directory is added to
 * `nonGitDirectories`.
 */
export async function resolveSessionRepositories(workingDirectories: readonly URI[], gitService: IAgentHostGitService, onRootError?: (directory: URI, error: unknown) => void): Promise<ISessionRepositories> {
	const limiter = new Limiter<{ workingDirectory: URI; repositoryRoot: URI | undefined }>(REPOSITORY_ROOT_RESOLUTION_CONCURRENCY);
	let resolvedRoots: { workingDirectory: URI; repositoryRoot: URI | undefined }[];
	try {
		resolvedRoots = await Promise.all(workingDirectories.map(workingDirectory => limiter.queue(async () => {
			try {
				return { workingDirectory, repositoryRoot: await gitService.getRepositoryRoot(workingDirectory) };
			} catch (err) {
				if (!onRootError) {
					throw err;
				}
				onRootError(workingDirectory, err);
				return { workingDirectory, repositoryRoot: undefined };
			}
		})));
	} finally {
		limiter.dispose();
	}

	const gitRepositories: URI[] = [];
	const nonGitDirectories: URI[] = [];
	const seenRepositoryKeys = new Set<string>();
	for (const { workingDirectory, repositoryRoot } of resolvedRoots) {
		if (!repositoryRoot) {
			nonGitDirectories.push(workingDirectory);
			continue;
		}
		const repositoryKey = extUriBiasedIgnorePathCase.getComparisonKey(repositoryRoot);
		if (seenRepositoryKeys.has(repositoryKey)) {
			continue;
		}
		seenRepositoryKeys.add(repositoryKey);
		gitRepositories.push(repositoryRoot);
	}
	return { gitRepositories, nonGitDirectories };
}
