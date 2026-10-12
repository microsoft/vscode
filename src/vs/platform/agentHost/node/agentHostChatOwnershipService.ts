/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentProvider, AgentSession, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, COPILOT_CLI_AGENT_PROVIDER_ID } from '../common/agent.js';
import { buildDefaultChatUri, buildSubagentChatUri, isAhpChatChannel, ResponsePartKind, ToolCallStatus, ToolResultContentType, type URI as ProtocolURI, type Turn } from '../common/state/sessionState.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import { IAgentHostStateManager, type AgentHostStateManager, type IChatRegistration } from './agentHostStateManager.js';

export type { IChatRegistration } from './agentHostStateManager.js';

/** Whether a provider's sessions are addressed by standard `ahp-session` URIs as well as provider-native ones. */
export function usesStandardSessionUris(provider: AgentProvider): boolean {
	return provider === COPILOT_CLI_AGENT_PROVIDER_ID || provider === CODEX_AGENT_PROVIDER_ID || provider === CLAUDE_AGENT_PROVIDER_ID;
}

/** The recorded owner of a chat, and the spawning tool call when it was found from a spawn edge. */
export interface IChatOwnerResolution {
	readonly owner: ProtocolURI;
	readonly spawnedBy: { readonly chat: ProtocolURI; readonly toolCallId: string; readonly title: string | undefined } | undefined;
}

/** Looks up the recorded owner of a chat. */
export type ChatOwnerLookup = (chat: ProtocolURI) => Promise<ProtocolURI | undefined>;

interface IDefaultChatIndex {
	readonly generation: number;
	readonly owners: ReadonlyMap<ProtocolURI, ProtocolURI>;
}

export const IAgentHostChatOwnershipService = createDecorator<IAgentHostChatOwnershipService>('agentHostChatOwnershipService');

/**
 * Resolves which session owns a chat and where its persisted data lives, from
 * recorded ownership only: the live chat registry, retained summaries, the
 * central catalog and the registered session inventory. A chat URI is never
 * decoded to find its owner.
 */
export interface IAgentHostChatOwnershipService {
	readonly _serviceBrand: undefined;

	/** Fires when a chat enters the registry with its recorded owner and storage. */
	readonly onDidRegisterChat: Event<IChatRegistration>;
	/** Fires when a chat leaves the registry, with the owner and storage it was registered with. */
	readonly onDidUnregisterChat: Event<IChatRegistration>;

	/** The session that owns a registered chat, or `undefined` when the chat is not registered. */
	getChatOwner(chat: ProtocolURI): ProtocolURI | undefined;
	/** Like {@link getChatOwner} but throws when the chat is not registered. */
	requireChatOwner(chat: ProtocolURI): ProtocolURI;
	/** The resource a registered chat's persisted data is keyed by. */
	getChatStorageResource(chat: ProtocolURI): ProtocolURI | undefined;
	/** The recorded storage of a chat, or the creation-time rule for one not registered yet. */
	resolveChatStorageResource(session: ProtocolURI, chat: ProtocolURI): ProtocolURI;
	/** The chat whose tool call spawned a registered chat, if any. */
	getChatParent(chat: ProtocolURI): ProtocolURI | undefined;
	/** The owner of a chat of a session that is no longer resident, from retained summaries. */
	findRetainedChatOwner(chat: ProtocolURI): ProtocolURI | undefined;

	/**
	 * Resolves the owner of a chat that may not be registered: the live
	 * registry, retained summaries, the central catalogs, the registered
	 * session inventory and cached catalog payloads, then restores in flight,
	 * then spawn edges recorded in loaded chats.
	 */
	resolveChatOwner(chat: ProtocolURI): Promise<IChatOwnerResolution | undefined>;
	/** A recorded-owner lookup for a pass over many chats; the pass reads the registered default-chat index at most once. */
	createRecordedOwnerLookup(): ChatOwnerLookup;
	/** Records a session or subagent restore so owner resolution waits for it before reporting a chat unknown. */
	trackRestore(restore: Promise<unknown>): void;
}

export class AgentHostChatOwnershipService implements IAgentHostChatOwnershipService {
	declare readonly _serviceBrand: undefined;

	private readonly _restoresInFlight = new Set<Promise<unknown>>();
	/** Default chat → registered session identity, valid for one registration generation. */
	private _defaultChatIndex: IDefaultChatIndex | undefined;
	private _defaultChatIndexBuild: Promise<IDefaultChatIndex> | undefined;

	readonly onDidRegisterChat: Event<IChatRegistration>;
	readonly onDidUnregisterChat: Event<IChatRegistration>;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostDatabase private readonly _database: IAgentHostDatabase,
	) {
		this.onDidRegisterChat = this._stateManager.onDidRegisterChat;
		this.onDidUnregisterChat = this._stateManager.onDidUnregisterChat;
	}

	getChatOwner(chat: ProtocolURI): ProtocolURI | undefined {
		return this._stateManager.getChatOwner(chat);
	}

	requireChatOwner(chat: ProtocolURI): ProtocolURI {
		return this._stateManager.requireChatOwner(chat);
	}

	getChatStorageResource(chat: ProtocolURI): ProtocolURI | undefined {
		return this._stateManager.getChatStorageResource(chat);
	}

	resolveChatStorageResource(session: ProtocolURI, chat: ProtocolURI): ProtocolURI {
		return this._stateManager.resolveChatStorageResource(session, chat);
	}

	getChatParent(chat: ProtocolURI): ProtocolURI | undefined {
		return this._stateManager.getChatParent(chat);
	}

	findRetainedChatOwner(chat: ProtocolURI): ProtocolURI | undefined {
		return this._stateManager.findRetainedChatOwner(chat);
	}

	async resolveChatOwner(chat: ProtocolURI): Promise<IChatOwnerResolution | undefined> {
		const recorded = await this._findRecordedChatOwner(chat, () => this._getDefaultChatIndex());
		if (recorded) {
			return recorded;
		}
		const inFlight = [...this._restoresInFlight];
		if (inFlight.length > 0) {
			await Promise.allSettled(inFlight);
			const owner = this._stateManager.getChatOwner(chat);
			if (owner !== undefined) {
				return { owner, spawnedBy: undefined };
			}
		}
		return this._findChatSpawnEdge(chat);
	}

	createRecordedOwnerLookup(): ChatOwnerLookup {
		// One index for the whole pass, so a pass builds it at most once.
		let index: Promise<ReadonlyMap<ProtocolURI, ProtocolURI>> | undefined;
		return async chat => (await this._findRecordedChatOwner(chat, () => index ??= this._getDefaultChatIndex()))?.owner;
	}

	trackRestore(restore: Promise<unknown>): void {
		this._restoresInFlight.add(restore);
		const settled = () => this._restoresInFlight.delete(restore);
		restore.then(settled, settled);
	}

	private async _findRecordedChatOwner(chat: ProtocolURI, getDefaultChatIndex: () => Promise<ReadonlyMap<ProtocolURI, ProtocolURI>>): Promise<IChatOwnerResolution | undefined> {
		const live = this._stateManager.getChatOwner(chat) ?? this._stateManager.findRetainedChatOwner(chat);
		if (live !== undefined) {
			return { owner: live, spawnedBy: undefined };
		}
		const central = (await this._database.findCentralChatOwners([chat])).get(chat);
		if (central) {
			return { owner: central.ownerSession, spawnedBy: undefined };
		}
		const owner = await this._findRegisteredDefaultChatOwner(chat, getDefaultChatIndex);
		if (owner !== undefined) {
			return { owner, spawnedBy: undefined };
		}
		// Scanning cached catalog payloads is the most expensive source, so it is the last.
		const payload = (await this._database.findCatalogPayloadChatOwners([chat])).get(chat);
		return payload === undefined ? undefined : { owner: payload.ownerSession, spawnedBy: undefined };
	}

	/**
	 * The registered session whose default chat is `chat`. A legacy default
	 * chat has no catalog row of its own, so its owner is the session record it
	 * was minted for, addressed by either its standard or its provider-native
	 * session URI.
	 */
	private async _findRegisteredDefaultChatOwner(chat: ProtocolURI, getDefaultChatIndex: () => Promise<ReadonlyMap<ProtocolURI, ProtocolURI>>): Promise<ProtocolURI | undefined> {
		const identity = (await getDefaultChatIndex()).get(chat);
		// The index mints standard default chats. A session whose default chat
		// is recorded differently is resident, evicted or announced, and the
		// live and retained lookups have already answered for it.
		return identity !== undefined && this._stateManager.getDefaultChatUri(identity) === chat ? identity : undefined;
	}

	private async _getDefaultChatIndex(): Promise<ReadonlyMap<ProtocolURI, ProtocolURI>> {
		const generation = await this._database.getRegistrationGeneration();
		if (this._defaultChatIndex?.generation === generation) {
			return this._defaultChatIndex.owners;
		}
		let index = await (this._defaultChatIndexBuild ?? this._startDefaultChatIndexBuild());
		if (index.generation < generation) {
			// A build already in flight may have read the registrations before this change.
			index = await this._startDefaultChatIndexBuild();
		}
		return index.owners;
	}

	private _startDefaultChatIndexBuild(): Promise<IDefaultChatIndex> {
		const build = this._buildDefaultChatIndex().finally(() => {
			if (this._defaultChatIndexBuild === build) {
				this._defaultChatIndexBuild = undefined;
			}
		});
		this._defaultChatIndexBuild = build;
		return build;
	}

	private async _buildDefaultChatIndex(): Promise<IDefaultChatIndex> {
		const { generation, current, legacy } = await this._database.readSessionRegistrations();
		const owners = new Map<ProtocolURI, ProtocolURI>();
		for (const { session, provider } of [...current, ...legacy]) {
			const identities = usesStandardSessionUris(provider)
				? [session, AgentSession.uri('ahp-session', AgentSession.id(session)).toString(), AgentSession.uri(provider, AgentSession.id(session)).toString()]
				: [session];
			for (const identity of identities) {
				owners.set(buildDefaultChatUri(identity), identity);
			}
		}
		const index = { generation, owners };
		if (!this._defaultChatIndex || this._defaultChatIndex.generation <= generation) {
			this._defaultChatIndex = index;
		}
		return index;
	}

	/**
	 * Finds a chat spawned by a tool call of a loaded chat: the spawned chat is
	 * owned by the spawning chat's owner, or is the default chat of the legacy
	 * subagent session the tool call reported.
	 */
	private _findChatSpawnEdge(chat: ProtocolURI): IChatOwnerResolution | undefined {
		for (const session of this._stateManager.getSessionUris()) {
			const state = this._stateManager.getSessionState(session);
			if (!state) {
				continue;
			}
			const candidates = [...new Set([state.defaultChat ?? this._stateManager.getDefaultChatUri(session), ...state.chats.map(summary => summary.resource)])];
			for (const candidate of candidates) {
				const chatState = this._stateManager.getChatState(candidate);
				if (!chatState) {
					continue;
				}
				for (const turn of [...chatState.turns, ...(chatState.activeTurn ? [chatState.activeTurn as Turn] : [])]) {
					for (const part of turn.responseParts) {
						if (part.kind !== ResponsePartKind.ToolCall || (part.toolCall.status !== ToolCallStatus.Completed && part.toolCall.status !== ToolCallStatus.Running)) {
							continue;
						}
						const { toolCallId } = part.toolCall;
						for (const content of part.toolCall.content ?? []) {
							if (content.type !== ToolResultContentType.Subagent) {
								continue;
							}
							const spawnedBy = { chat: candidate, toolCallId, title: content.title || undefined };
							if (content.resource === chat || buildSubagentChatUri(session, toolCallId) === chat) {
								return { owner: session, spawnedBy };
							}
							if (!isAhpChatChannel(content.resource) && buildDefaultChatUri(content.resource) === chat) {
								return { owner: content.resource, spawnedBy };
							}
						}
					}
				}
			}
		}
		return undefined;
	}
}
