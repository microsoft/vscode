/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionFileDiff } from '../common/state/sessionState.js';

/**
 * Maximum number of unique diff targets (git repositories + non-git folders)
 * processed for a single multi-root changeset compute. A safety valve for
 * pathological workspaces; folders beyond the cap are skipped with a warning.
 */
export const MAX_MULTI_ROOT_DIFF_TARGETS = 20;

/**
 * A resolved diff target: either a unique git repository root (diffed once,
 * however many working directories mapped to it) or a non-git folder (whose
 * changes come from the DB edit-tracker fallback).
 */
type IMultiRootDiffTarget =
	| { readonly kind: 'git'; readonly repoRoot: URI }
	| { readonly kind: 'nonGit'; readonly dir: URI };

/**
 * Callbacks + context the {@link computeDiffsAcrossWorkingDirectories}
 * orchestrator needs. Kept changeset-kind-agnostic so the turn changeset
 * (parent→current checkpoint refs) and the independent all-folder summary
 * (per-repo branch diffs) can share the same grouping / cap / parallelism /
 * fallback / dedup machinery, and so future multi-root branch/session/uncommitted
 * work can reuse it by supplying a different {@link computeGitDiff}.
 */
export interface IMultiRootDiffContext {
	/** Session URI string, for log messages. */
	readonly session: string;
	readonly logService: ILogService;

	/** Resolves a working directory to its git repository root, or `undefined` when the directory is not a git work tree. */
	getRepositoryRoot(dir: URI): Promise<URI | undefined>;

	/**
	 * Computes the git diff for one unique repository root. Return `undefined`
	 * to signal a git failure (missing checkpoint/ref, git error) — the
	 * orchestrator then falls back to the DB edit-tracker for that repo and logs
	 * an error. Return `[]` for a successful compute that found no changes.
	 */
	computeGitDiff(repoRoot: URI): Promise<readonly ISessionFileDiff[] | undefined>;

	/**
	 * Computes the DB edit-tracker fallback restricted to the given roots (the
	 * union of non-git folders and any git repos whose {@link computeGitDiff}
	 * failed). Called at most once.
	 */
	computeFallbackDiff(roots: readonly URI[]): Promise<readonly ISessionFileDiff[]>;
}

/**
 * Computes file diffs across every effective working directory of a multi-root
 * session and aggregates them into one flat list.
 *
 * Implements the shared multi-root rules:
 * - **Q3 dedup:** working directories that resolve to the same git repository
 *   root are diffed once (grouped by repo-root comparison key); non-git folders
 *   are separate targets. Effective-directory order is preserved.
 * - **Q4 cap:** at most {@link MAX_MULTI_ROOT_DIFF_TARGETS} targets; excess are
 *   skipped with a single warning.
 * - **Parallel:** all git-repo diffs run concurrently.
 * - **Q2 graceful fallback:** a git failure (or non-git folder) routes that
 *   target to the DB edit-tracker fallback; each git failure is logged as an
 *   error. The aggregate never rejects — a failing fallback logs and returns the
 *   successful git results.
 * - Final defensive dedup by `after.uri ?? before.uri` (the changeset reducer
 *   does not enforce id uniqueness).
 */
export async function computeDiffsAcrossWorkingDirectories(
	workingDirectories: readonly URI[],
	ctx: IMultiRootDiffContext,
): Promise<readonly ISessionFileDiff[]> {
	// 1. Resolve each working directory to a repository root (parallel). A thrown
	//    probe is treated as non-git (it will route to the DB fallback).
	const resolved = await Promise.all(workingDirectories.map(async dir => {
		try {
			return { dir, repoRoot: await ctx.getRepositoryRoot(dir) };
		} catch (err) {
			ctx.logService.error(`[MultiRootDiff] Failed to resolve repository root for ${dir.toString()} in ${ctx.session}: ${errText(err)}`);
			return { dir, repoRoot: undefined };
		}
	}));

	// 2. Build ordered unique targets: dedup git repos by repo-root key; keep
	//    non-git folders as separate targets. Preserve effective-directory order.
	const targets: IMultiRootDiffTarget[] = [];
	const seenRepoKeys = new Set<string>();
	for (const { dir, repoRoot } of resolved) {
		if (repoRoot) {
			const key = extUriBiasedIgnorePathCase.getComparisonKey(repoRoot);
			if (seenRepoKeys.has(key)) {
				continue;
			}
			seenRepoKeys.add(key);
			targets.push({ kind: 'git', repoRoot });
		} else {
			targets.push({ kind: 'nonGit', dir });
		}
	}

	// 3. Cap.
	let effectiveTargets = targets;
	if (targets.length > MAX_MULTI_ROOT_DIFF_TARGETS) {
		const skipped = targets.length - MAX_MULTI_ROOT_DIFF_TARGETS;
		ctx.logService.warn(`[MultiRootDiff] ${ctx.session} has ${targets.length} diff targets; capping at ${MAX_MULTI_ROOT_DIFF_TARGETS} and skipping ${skipped}.`);
		effectiveTargets = targets.slice(0, MAX_MULTI_ROOT_DIFF_TARGETS);
	}

	// 4. Run git diffs in parallel; collect fallback roots for failures.
	const fallbackRoots: URI[] = [];
	const gitResults: ISessionFileDiff[] = [];
	const gitTargets = effectiveTargets.filter((t): t is { kind: 'git'; repoRoot: URI } => t.kind === 'git');

	await Promise.all(gitTargets.map(async ({ repoRoot }) => {
		try {
			const diff = await ctx.computeGitDiff(repoRoot);
			if (diff === undefined) {
				// 5. Q2: git failure → DB fallback for this repo, logged as error.
				ctx.logService.error(`[MultiRootDiff] Git diff unavailable for ${repoRoot.toString()} in ${ctx.session}; falling back to edit-tracker.`);
				fallbackRoots.push(repoRoot);
				return;
			}
			gitResults.push(...diff);
		} catch (err) {
			ctx.logService.error(`[MultiRootDiff] Git diff failed for ${repoRoot.toString()} in ${ctx.session}: ${errText(err)}; falling back to edit-tracker.`);
			fallbackRoots.push(repoRoot);
		}
	}));

	// 6. Non-git folders always use the DB fallback (no error log — expected).
	for (const t of effectiveTargets) {
		if (t.kind === 'nonGit') {
			fallbackRoots.push(t.dir);
		}
	}

	let fallbackResults: readonly ISessionFileDiff[] = [];
	if (fallbackRoots.length > 0) {
		try {
			fallbackResults = await ctx.computeFallbackDiff(fallbackRoots);
		} catch (err) {
			ctx.logService.error(`[MultiRootDiff] Edit-tracker fallback failed for ${ctx.session} (${fallbackRoots.length} root(s)): ${errText(err)}.`);
			fallbackResults = [];
		}
	}

	// 7. Flatten + defensive dedup by file id (after.uri ?? before.uri).
	const byId = new Map<string, ISessionFileDiff>();
	for (const diff of [...gitResults, ...fallbackResults]) {
		const id = diff.after?.uri ?? diff.before?.uri;
		if (!id) {
			continue;
		}
		byId.set(id, diff);
	}
	return [...byId.values()];
}

function errText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
