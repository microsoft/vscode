/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestSearchItem } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { PullArtifactRef } from '../vscode/cloudAgentBackend';

export interface ResolveOptions {
	readonly attempts?: number;
	readonly spacingMs?: number;
}

/**
 * Resolve a raw {@link PullArtifactRef} to a full {@link PullRequestSearchItem} for UI rendering.
 *
 * Strategy:
 * - If the backend already provided `preResolved`, return it.
 * - Try the GraphQL `getPullRequestFromGlobalId` lookup using `globalId`.
 * - Fall back to listing the user's open PRs in the repo and matching on `headRef`.
 *
 * Returns `undefined` on best-effort failure; callers decide whether to retry or render
 * the session without PR metadata (PR-less or not-yet-indexed cases).
 */
export async function resolvePullArtifact(
	octokit: IOctoKitService,
	log: ILogService,
	ref: PullArtifactRef,
): Promise<PullRequestSearchItem | undefined> {
	if (ref.preResolved) {
		return ref.preResolved;
	}
	if (ref.globalId) {
		try {
			const pr = await octokit.getPullRequestFromGlobalId(ref.globalId, {});
			if (pr) {
				return pr;
			}
		} catch (e) {
			log.trace(`resolvePullArtifact: getPullRequestFromGlobalId failed for ${ref.globalId}: ${e}`);
		}
	}
	// Fallback to listing the repo's open PRs and matching by databaseId or headRef. We list
	// once and try both predicates so the round trip pays off when either signal is available.
	if ((ref.databaseId !== undefined || ref.headRef) && ref.repo.owner && ref.repo.name) {
		try {
			const prs = await octokit.getOpenPullRequestsForUser(ref.repo.owner, ref.repo.name, {});
			if (ref.databaseId !== undefined) {
				const byId = prs.find(p => p.fullDatabaseId === ref.databaseId);
				if (byId) {
					return byId;
				}
			}
			if (ref.headRef) {
				const byHead = prs.find(p => p.headRefName === ref.headRef);
				if (byHead) {
					return byHead;
				}
			}
		} catch (e) {
			log.trace(`resolvePullArtifact: getOpenPullRequestsForUser failed for ${ref.repo.owner}/${ref.repo.name}: ${e}`);
		}
	}
	return undefined;
}

/**
 * Retrying variant. Useful immediately after a task creates a PR — GitHub may take a
 * few seconds before the GraphQL node id resolves or the PR appears in the user's open
 * list.
 */
export async function resolvePullArtifactWithRetry(
	octokit: IOctoKitService,
	log: ILogService,
	ref: PullArtifactRef,
	opts: ResolveOptions = {},
): Promise<PullRequestSearchItem | undefined> {
	const attempts = opts.attempts ?? 5;
	const spacingMs = opts.spacingMs ?? 2_000;
	for (let i = 1; i <= attempts; i++) {
		const resolved = await resolvePullArtifact(octokit, log, ref);
		if (resolved) {
			return resolved;
		}
		if (i < attempts) {
			await new Promise(resolve => setTimeout(resolve, spacingMs));
		}
	}
	log.warn(`resolvePullArtifactWithRetry: could not resolve PR after ${attempts} attempts (globalId=${ref.globalId ?? 'n/a'}, headRef=${ref.headRef ?? 'n/a'}, repo=${ref.repo.owner}/${ref.repo.name})`);
	return undefined;
}
