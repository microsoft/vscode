/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IOutgoingTurn, IRestoredChat } from '../../../common/agentHostChatContributionsService.js';
import { isRemoteAgentHostSessionType, remoteAgentHostSessionTypeId } from '../../../common/agentHostSessionType.js';
import { DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, ISessionDataService, REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { buildDefaultChatUri, readSessionCreationReference, SESSION_META_SPAWN_DEPTH_KEY, withSessionSpawnDepth } from '../../../common/state/sessionState.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostRemoteAgentsService } from '../../agentHostRemoteAgentsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostStorageService } from '../../agentHostStorageService.js';
import { IAgentHostSessionToolCallbacks } from '../../shared/sessionServerTools.js';
import { RemoteSessionDelegationService, toRemoteSessionTargetHandle, type IRemoteSessionDelegationSource } from './remoteSessionDelegationService.js';

const REMOTE_AGENT_PROVIDER_DATA_VERSION = 1;

interface IRemoteAgentProviderData {
	readonly version: typeof REMOTE_AGENT_PROVIDER_DATA_VERSION;
	readonly connectorId: string;
	readonly targetId: string;
	readonly provider: string;
	readonly session: string;
	readonly chat: string;
}

type IRemoteSessionDelegationMetadata = Omit<IRemoteSessionDelegationSource, 'spawnDepth'> & {
	readonly spawnDepth?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRemoteAgentProviderData(value: string): IRemoteAgentProviderData | undefined {
	try {
		const candidate: unknown = JSON.parse(value);
		if (!isRecord(candidate)) {
			return undefined;
		}
		return candidate.version === REMOTE_AGENT_PROVIDER_DATA_VERSION
			&& typeof candidate.connectorId === 'string'
			&& typeof candidate.targetId === 'string'
			&& typeof candidate.provider === 'string'
			&& typeof candidate.session === 'string'
			&& typeof candidate.chat === 'string'
			? {
				version: REMOTE_AGENT_PROVIDER_DATA_VERSION,
				connectorId: candidate.connectorId,
				targetId: candidate.targetId,
				provider: candidate.provider,
				session: candidate.session,
				chat: candidate.chat,
			}
			: undefined;
	} catch {
		return undefined;
	}
}

function parseSpawnDepth(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const depth = Number(value);
	return Number.isInteger(depth) && depth >= 0 ? depth : undefined;
}

/** Publishes A's broker tool into remote-backed sessions before their turns run. */
export class RemoteSessionDelegationContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'remoteSessionDelegation';
	readonly order = 75;

	private readonly _delegationService: RemoteSessionDelegationService;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostStorageService storageService: IAgentHostStorageService,
		@IAgentHostRemoteAgentsService remoteAgentsService: IAgentHostRemoteAgentsService,
		@IAgentHostProviderService providerService: IAgentHostProviderService,
		@IAgentHostSessionToolCallbacks sessionToolCallbacks: IAgentHostSessionToolCallbacks,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._delegationService = this._register(new RemoteSessionDelegationService(
			_sessionDataService,
			storageService,
			remoteAgentsService,
			providerService,
			sessionToolCallbacks,
			_stateManager,
			_logService,
		));
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<undefined> {
		const metadata = await this._readSource(turn.session, turn.chat);
		if (metadata) {
			const source = await this._activateSource(metadata);
			await this._delegationService.ensureSource(source);
		}
		return undefined;
	}

	async onHydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		if (context.chat === buildDefaultChatUri(context.session)) {
			await this._readSource(context.session, context.chat);
		}
		return restored;
	}

	async onDidHydrateChat(context: IHydrationContext): Promise<void> {
		if (context.chat !== buildDefaultChatUri(context.session)) {
			return;
		}
		const metadata = await this._readSource(context.session, context.chat);
		if (metadata) {
			const source = await this._activateSource(metadata);
			await this._delegationService.ensureSource(source);
		}
	}

	private async _readSource(session: string, chat: string): Promise<IRemoteSessionDelegationMetadata | undefined> {
		const provider = AgentSession.provider(session);
		if (!provider || !isRemoteAgentHostSessionType(provider)) {
			return undefined;
		}
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(session));
		if (!ref) {
			return undefined;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY]: true,
				[REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY]: true,
			});
			const raw = metadata[DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY];
			if (raw === undefined) {
				return undefined;
			}
			const providerData = parseRemoteAgentProviderData(raw);
			if (!providerData || providerData.chat !== buildDefaultChatUri(providerData.session)) {
				this._logService.warn(`[RemoteSessionDelegation] Ignoring invalid remote provider data for ${session}.`);
				return undefined;
			}
			const expectedProvider = remoteAgentHostSessionTypeId(
				toRemoteSessionTargetHandle(providerData.connectorId, providerData.targetId),
				providerData.provider,
			);
			if (provider !== expectedProvider || AgentSession.provider(providerData.session) !== providerData.provider) {
				this._logService.warn(`[RemoteSessionDelegation] Ignoring remote provider data with mismatched ownership for ${session}.`);
				return undefined;
			}
			const rawSpawnDepth = metadata[REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY];
			const spawnDepth = parseSpawnDepth(rawSpawnDepth);
			if (rawSpawnDepth !== undefined && spawnDepth === undefined) {
				throw new Error(`Remote delegation source has invalid persisted spawn depth: ${session}.`);
			}
			return {
				session: URI.parse(session),
				chat: URI.parse(chat),
				connectorId: providerData.connectorId,
				targetId: providerData.targetId,
				downstreamSession: URI.parse(providerData.session),
				spawnDepth,
			};
		} finally {
			ref.dispose();
		}
	}

	private async _activateSource(metadata: IRemoteSessionDelegationMetadata): Promise<IRemoteSessionDelegationSource> {
		const summary = this._stateManager.getSessionSummary(metadata.session.toString());
		if (!summary) {
			throw new Error(`Remote delegation source is not resident: ${metadata.session.toString()}.`);
		}
		const liveDepth = summary._meta?.[SESSION_META_SPAWN_DEPTH_KEY];
		if (liveDepth !== undefined && (typeof liveDepth !== 'number' || !Number.isInteger(liveDepth) || liveDepth < 0)) {
			throw new Error(`Remote delegation source has invalid spawn depth: ${metadata.session.toString()}.`);
		}
		if (metadata.spawnDepth !== undefined && liveDepth !== undefined && metadata.spawnDepth !== liveDepth) {
			throw new Error(`Remote delegation source has conflicting spawn depth: ${metadata.session.toString()}.`);
		}
		if (metadata.spawnDepth === undefined && liveDepth === undefined && readSessionCreationReference(summary._meta)) {
			throw new Error(`Remote delegation source has no recoverable spawn depth: ${metadata.session.toString()}.`);
		}
		const spawnDepth = metadata.spawnDepth ?? liveDepth ?? 0;
		if (metadata.spawnDepth === undefined) {
			const ref = this._sessionDataService.openDatabase(metadata.session);
			try {
				await ref.object.setMetadata(REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY, String(spawnDepth));
			} finally {
				ref.dispose();
			}
		}
		if (liveDepth !== spawnDepth) {
			this._stateManager.dispatchServerAction(metadata.session.toString(), {
				type: ActionType.SessionMetaChanged,
				_meta: withSessionSpawnDepth(summary._meta, spawnDepth),
			});
		}
		return { ...metadata, spawnDepth };
	}
}
