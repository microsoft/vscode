/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { ISessionFileDiff } from '../common/state/sessionState.js';

/** Maximum unique repositories and non-git folders processed by one multi-root diff. */
export const MAX_MULTI_ROOT_DIFF_TARGETS = 20;

type IMultiRootDiffTarget =
	| { readonly kind: 'git'; readonly repoRoot: URI }
	| { readonly kind: 'nonGit'; readonly dir: URI };

/**
 * Supplies repository resolution and diff callbacks for {@link computeDiffsAcrossWorkingDirectories}.
 */
export interface IMultiRootDiffContext {
	readonly session: string;
	readonly logService: ILogService;

	getRepositoryRoot(dir: URI): Promise<URI | undefined>;

	/**
	 * Computes one repository diff; `undefined` requests edit-tracker fallback.
	 */
	computeGitDiff(repoRoot: URI): Promise<readonly ISessionFileDiff[] | undefined>;

	/**
	 * Computes edit-tracker fallback for non-git and failed-git roots.
	 */
	computeFallbackDiff(roots: readonly URI[]): Promise<readonly ISessionFileDiff[]>;
}

/**
 * Computes parallel per-repository diffs with bounded targets and edit-tracker fallback.
 * Results are deduplicated by platform-aware file-resource identity.
 */
export async function computeDiffsAcrossWorkingDirectories(
	workingDirectories: readonly URI[],
	ctx: IMultiRootDiffContext,
): Promise<readonly ISessionFileDiff[]> {
	const resolved = await Promise.all(workingDirectories.map(async dir => {
		try {
			return { dir, repoRoot: await ctx.getRepositoryRoot(dir) };
		} catch (err) {
			ctx.logService.error(`[MultiRootDiff] Failed to resolve repository root for ${dir.toString()} in ${ctx.session}: ${errText(err)}`);
			return { dir, repoRoot: undefined };
		}
	}));

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

	let effectiveTargets = targets;
	if (targets.length > MAX_MULTI_ROOT_DIFF_TARGETS) {
		const skipped = targets.length - MAX_MULTI_ROOT_DIFF_TARGETS;
		ctx.logService.warn(`[MultiRootDiff] ${ctx.session} has ${targets.length} diff targets; capping at ${MAX_MULTI_ROOT_DIFF_TARGETS} and skipping ${skipped}.`);
		effectiveTargets = targets.slice(0, MAX_MULTI_ROOT_DIFF_TARGETS);
	}

	const fallbackRoots: URI[] = [];
	const gitResults: ISessionFileDiff[] = [];
	const gitTargets = effectiveTargets.filter((t): t is { kind: 'git'; repoRoot: URI } => t.kind === 'git');

	await Promise.all(gitTargets.map(async ({ repoRoot }) => {
		try {
			const diff = await ctx.computeGitDiff(repoRoot);
			if (diff === undefined) {
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

	const byId = new Map<string, ISessionFileDiff>();
	for (const diff of [...gitResults, ...fallbackResults]) {
		const id = diff.after?.uri ?? diff.before?.uri;
		if (!id) {
			continue;
		}
		const resource = URI.parse(id);
		const key = resource.scheme === Schemas.file
			? extUriBiasedIgnorePathCase.getComparisonKey(resource)
			: id;
		byId.set(key, diff);
	}
	return [...byId.values()];
}

function errText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
