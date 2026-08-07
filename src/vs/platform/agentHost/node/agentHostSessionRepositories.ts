/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';

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
 * Maps a session's effective working directories to the set of UNIQUE git
 * repository roots backing them, reporting which directories are not
 * git-backed.
 *
 * Each working directory is resolved to its repository root via
 * {@link IAgentHostGitService.getRepositoryRoot}, which returns `undefined`
 * for a directory that is not a git work tree. Multiple folders that resolve
 * to the same repository root (e.g. a repository and one of its
 * subdirectories) yield that root exactly once, so callers diff each repo a
 * single time. Directories without a repository root are collected into
 * {@link ISessionRepositories.nonGitDirectories} for callers that fall back to
 * a non-git change source.
 *
 * Pure aside from the injected {@link gitService}: it neither reads ambient
 * state nor mutates its inputs, and the roots are looked up in parallel while
 * the results preserve the input order for deterministic output. Callers parse
 * their string working directories into `URI`s before calling, keeping this
 * easy to unit test.
 *
 * By default a repository-root lookup failure rejects the whole resolution
 * (callers that cannot meaningfully continue without every root — e.g. the
 * branch summary and the git-blob resolver — rely on this). Turn-diff callers
 * that want per-root isolation pass {@link onRootError}: each failing directory
 * is reported through it and treated as a non-git directory (so it falls back to
 * the DB-tracked change source), and one directory's failure never drops the
 * rest of the turn changeset.
 */
export async function resolveSessionRepositories(workingDirectories: readonly URI[], gitService: IAgentHostGitService, onRootError?: (directory: URI, error: unknown) => void): Promise<ISessionRepositories> {
	const resolvedRoots = await Promise.all(workingDirectories.map(async workingDirectory => {
		try {
			return { workingDirectory, repositoryRoot: await gitService.getRepositoryRoot(workingDirectory) };
		} catch (err) {
			if (!onRootError) {
				throw err;
			}
			onRootError(workingDirectory, err);
			return { workingDirectory, repositoryRoot: undefined };
		}
	}));

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
