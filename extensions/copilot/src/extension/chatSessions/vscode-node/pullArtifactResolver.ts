/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentTaskSession } from '@vscode/copilot-api';
import { PullRequestSearchItem } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
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
	telemetry?: ITelemetryService,
): Promise<PullRequestSearchItem | undefined> {
	// Records which strategy (primary or a specific fallback) resolved the PR, so we can see how
	// often — and via which path — resolution degrades past the direct global-id lookup.
	const reportResolved = (resolvedVia: 'preResolved' | 'globalId' | 'sessionGlobalId' | 'openPrDatabaseId' | 'openPrHeadRef' | 'unresolved') => {
		/* __GDPR__
			"copilotcloud.pullArtifactResolve" : {
				"owner": "osortega",
				"comment": "Tracks which strategy resolved a cloud task's pull request artifact, to monitor how often resolution falls back past the direct global-id lookup.",
				"resolvedVia": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Strategy that produced the pull request: preResolved, globalId, sessionGlobalId, openPrDatabaseId, openPrHeadRef, or unresolved." },
				"hadGlobalId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the artifact carried a GraphQL global id." },
				"hadDatabaseId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the artifact carried a pull request database id." },
				"hadHeadRef": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the artifact carried a head branch ref." },
				"sessionCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of task sessions available for the session global-id fallback." }
			}
		*/
		telemetry?.sendMSFTTelemetryEvent('copilotcloud.pullArtifactResolve', {
			resolvedVia,
			hadGlobalId: String(!!ref.globalId),
			hadDatabaseId: String(ref.databaseId !== undefined),
			hadHeadRef: String(!!ref.headRef),
		}, {
			sessionCount: agentTaskSessions?.length ?? 0,
		});
	};

	if (ref.preResolved) {
		reportResolved('preResolved');
		return ref.preResolved;
	}
	if (ref.globalId) {
		const data = await getPullRequestFromGlobalId(octokit, log, ref.globalId);
		if (data) {
			reportResolved('globalId');
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
				reportResolved('sessionGlobalId');
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
					reportResolved('openPrDatabaseId');
					return byId;
				}
			}
			if (ref.headRef) {
				const byHead = prs.find(p => p.headRefName === ref.headRef);
				if (byHead) {
					reportResolved('openPrHeadRef');
					return byHead;
				}
			}
		} catch (e) {
			log.trace(`resolvePullArtifact: getOpenPullRequestsForUser failed for ${ref.repo.owner}/${ref.repo.name}: ${e}`);
		}
	}
	reportResolved('unresolved');
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
