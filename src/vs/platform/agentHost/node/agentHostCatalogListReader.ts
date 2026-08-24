/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { AgentSession, type IAgentSessionMetadata } from '../common/agent.js';
import { SessionArtifactType, withSessionArtifacts } from '../common/sessionArtifacts.js';
import { SessionSourceControlOutcome, SessionStatus, withSessionEhcliAdoptable, withSessionEhcliAdopted, withSessionExternal, withSessionFolderPickerDecision, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionOrchestration, withSessionSourceControlState, withSessionStatusFlag, withSessionWorkspaceless } from '../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_PROJECTION_VERSION, parseAgentHostDatabaseCatalog, type IAgentHostCatalogSource } from './agentHostCatalogProjection.js';
import type { IAgentHostDatabase } from './agentHostDatabase.js';
import type { IRegisteredSession } from './agentSessionRegistry.js';

const artifactTypes = {
	pullRequest: SessionArtifactType.PullRequest,
	issue: SessionArtifactType.Issue,
	commit: SessionArtifactType.Commit,
	website: SessionArtifactType.Website,
	file: SessionArtifactType.File,
	resource: SessionArtifactType.Resource,
} as const;

export type AgentHostCatalogListIneligibilityReason =
	| 'missingCatalog'
	| 'chatBacking'
	| 'identityMismatch'
	| 'providerMismatch'
	| 'outdated'
	| 'malformed'
	| 'readError';

export type AgentHostCatalogListResult =
	| { readonly eligible: true; readonly metadata: IAgentSessionMetadata; readonly source: IAgentHostCatalogSource }
	| { readonly eligible: false; readonly reason: Exclude<AgentHostCatalogListIneligibilityReason, 'readError'> }
	| { readonly eligible: false; readonly reason: 'readError'; readonly error: Error };

export class AgentHostCatalogListReader {

	constructor(private readonly _catalogDatabase: IAgentHostDatabase) { }

	async read(registered: IRegisteredSession): Promise<AgentHostCatalogListResult> {
		const session = registered.session.toString();
		try {
			const catalog = await this._catalogDatabase.getSessionV2(session);
			if (!catalog) {
				return { eligible: false, reason: 'missingCatalog' };
			}
			if (catalog.session !== session) {
				return { eligible: false, reason: 'identityMismatch' };
			}
			if (catalog.isChatBacking) {
				return { eligible: false, reason: 'chatBacking' };
			}
			if (AgentSession.provider(registered.session) !== registered.provider || catalog.provider !== registered.provider) {
				return { eligible: false, reason: 'providerMismatch' };
			}
			if (catalog.projectionVersion !== AGENT_HOST_CATALOG_PROJECTION_VERSION) {
				return { eligible: false, reason: 'outdated' };
			}
			const parsed = parseAgentHostDatabaseCatalog(catalog);
			if (!parsed.ok) {
				return { eligible: false, reason: 'malformed' };
			}
			return {
				eligible: true,
				metadata: this._toSessionMetadata(registered, parsed.value.source),
				source: parsed.value.source,
			};
		} catch (error) {
			return {
				eligible: false,
				reason: 'readError',
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private _toSessionMetadata(registered: IRegisteredSession, source: IAgentHostCatalogSource): IAgentSessionMetadata {
		let status = withSessionStatusFlag(SessionStatus.Idle, SessionStatus.IsRead, source.isRead);
		status = withSessionStatusFlag(status, SessionStatus.IsArchived, source.isArchived);

		let meta = withSessionExternal(undefined, registered.external);
		meta = withSessionWorkspaceless(meta, source.workspaceless);
		if (source.ehcliAdoptable) {
			meta = withSessionEhcliAdoptable(meta);
		}
		meta = withSessionEhcliAdopted(meta, source.ehcliAdopted === true);
		meta = withSessionMultiRootMetadata(meta, source.multiRoot);
		meta = withSessionFolderPickerDecision(meta, source.folderPicker);
		meta = withSessionGitHubState(meta, source.github);
		meta = withSessionGitState(meta, source.git);
		meta = withSessionSourceControlState(meta, source.sourceControl ? {
			merge: source.sourceControl.merge,
			latestOutcome: source.sourceControl.latestOutcome === 'merge'
				? SessionSourceControlOutcome.Merge
				: source.sourceControl.latestOutcome === 'pullRequest'
					? SessionSourceControlOutcome.PullRequest
					: undefined,
		} : undefined);
		meta = withSessionArtifacts(meta, source.artifacts?.map(artifact => ({
			...artifact,
			type: artifactTypes[artifact.type],
		})) ?? []);
		if (source.orchestration) {
			meta = withSessionOrchestration(meta, source.orchestration);
		}

		return {
			session: registered.session,
			startTime: registered.startTime,
			modifiedTime: source.modifiedTime,
			summary: source.title,
			status,
			project: source.project ? { uri: URI.parse(source.project.uri), displayName: source.project.displayName } : undefined,
			workingDirectories: source.workingDirectories.map(directory => URI.parse(directory)),
			changes: source.changes,
			...(meta !== undefined ? { _meta: meta } : {}),
		};
	}
}
