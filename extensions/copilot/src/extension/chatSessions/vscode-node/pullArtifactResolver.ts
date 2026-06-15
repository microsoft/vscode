/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentTaskSession } from '@vscode/copilot-api';
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
	agentTaskSessions?: AgentTaskSession[],
): Promise<PullRequestSearchItem | undefined> {
	if (ref.preResolved) {
		return ref.preResolved;
	}
	if (ref.globalId) {
		const data = await getPullRequestFromGlobalId(octokit, log, ref.globalId);
		if (data) {
			return data;
		}
	}
	// Fallback 1: Get global ID from a task session
	if (agentTaskSessions && agentTaskSessions.length > 0) {
		// TODO: update package with new type
		const sessions = agentTaskSessions as (AgentTaskSession & { resource_global_id?: string })[];
		const globalId = sessions.find(s => !!s.resource_global_id)?.resource_global_id;
		if (globalId) {
			const data = await getPullRequestFromGlobalId(octokit, log, globalId);
			if (data) {
				return data;
			}
		}
	}
	// Fallback 2: Listing the repo's open PRs and matching by databaseId or headRef. We list
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

const getPullRequestFromGlobalId = async (
	octokit: IOctoKitService,
	log: ILogService,
	globalId: string
) => {
	try {
		const pr = await octokit.getPullRequestFromGlobalId(globalId, {});
		if (pr) {
			return pr;
		}
	} catch (e) {
		log.trace(`resolvePullArtifact: getPullRequestFromGlobalId failed for ${globalId}: ${e}`);
	}
};
