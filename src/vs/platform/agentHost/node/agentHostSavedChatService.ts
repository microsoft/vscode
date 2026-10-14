/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { coalesce } from '../../../base/common/arrays.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import type { IReference } from '../../../base/common/lifecycle.js';
import { stableStringify } from '../../../base/common/objects.js';
import { isEqualOrParent, joinPath, relativePath } from '../../../base/common/resources.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { vArray, vBoolean, vObj, vOptionalProp, vString, vUnknown } from '../../../base/common/validation.js';
import type { ILogService } from '../../log/common/log.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID, type AgentProvider } from '../common/agent.js';
import type { AgentHostSavedChatWorkspace, IAgentHostSavedChat, IAgentHostSavedChatContinuation, IAgentHostSavedChatContinuationResult } from '../common/agentHostSavedChat.js';
import { deriveLegacyDefaultChat } from '../common/agentHostLegacyDefaultChat.js';
import { getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';
import { parseFolderChangesetOwnerUri } from '../common/changesetUri.js';
import type { IAgentHostSessionStateStore } from '../common/agentHostSessionStateStore.js';
import type { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import { ChatOriginKind, ResponsePartKind, type ChatOrigin, type ResponsePart, type Turn } from '../common/state/protocol/channels-chat/state.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, isAhpChatChannel, readSessionWorkspaceless } from '../common/state/sessionState.js';
import { decodeAgentHostCatalogPayloadData } from './agentHostCatalogProjection.js';
import { fromCatalogChatOrigin, isAgentHostChatBacking, toSerializableJsonValue } from './agentHostCatalogSourceResolver.js';
import type { IAgentHostDatabase, IAgentHostDatabaseCatalogSnapshotEntry, IAgentHostDatabaseChatV2 } from './agentHostDatabase.js';
import { interleaveLocalTurns, parsePersistedTurn } from './agentHostLocalTurns.js';
import { CHAT_INHERITED_TURN_METADATA_KEY, CHAT_ORIGIN_METADATA_KEY, CHAT_PROVIDER_DATA_METADATA_KEY, CHAT_WORKING_DIRECTORIES_METADATA_KEY, PEER_CHATS_METADATA_KEY, type IPersistedPeerChat } from './agentHostPeerChatStore.js';
import { applyPersistedFailedTurns } from './chatContributions/persistedFailedTurns/persistedFailedTurnsContribution.js';
import { applyPersistedTurnUsage } from './chatContributions/persistedTurnUsage/persistedTurnUsageContribution.js';
import { applySavedWorkspaceTransitions } from './chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionContribution.js';
import { resolveSideChatBoundary, sliceSideChatTurns } from './chatContributions/sideChat/sideChatContext.js';
import { applyPersistedTurnDelegations } from './chatContributions/turnDelegation/turnDelegationContribution.js';
import { customChatTitleMetadataKey, parseSessionWorkingDirectories, SESSION_CUSTOM_TITLE_KEY, SESSION_WORKING_DIRECTORIES_KEY } from './shared/persistSessionMetadata.js';
import { readSessionAdditionalWorktrees, type ISessionAdditionalWorktree } from './shared/sessionAdditionalWorktrees.js';
import { applySavedWorktreeAnnouncement, detachedWorktreeRecordUri, readPersistedWorktreeMetadata } from './shared/worktreeIsolation.js';

/** Host-validated, exact-chat storage facts. Provider data remains opaque outside its reader. */
export interface IAgentHostSavedChatBacking {
	readonly session: URI;
	readonly chat: URI;
	readonly storageResource: URI;
	readonly providerData: string | undefined;
	readonly origin: ChatOrigin | undefined;
	readonly inheritedTurnId?: string;
	readonly workingDirectories: readonly URI[];
}

export interface IAgentHostSavedChatReadContext extends IAgentHostSavedChatBacking {
	/** Exact persisted spawning chat, supplied for a tool-origin child. */
	readonly parent?: IAgentHostSavedChatBacking;
}

/** A provider-native decoder with no source-session execution surface. */
export interface IAgentHostSavedChatReader {
	read(context: IAgentHostSavedChatReadContext, token: CancellationToken): Promise<readonly Turn[]>;
}

interface IResolvedSavedChat {
	readonly context: IAgentHostSavedChatReadContext;
	readonly provider: AgentProvider;
	readonly title: string;
	readonly workspaceless: boolean;
	readonly isDefault: boolean;
	readonly identity: string;
	readonly archived: boolean;
	readonly sessionArchived: boolean;
	readonly continuation: ReturnType<typeof readContinuation>;
	readonly publicChats: readonly string[];
}

export type AgentHostSavedChatArchiveTarget = { readonly kind: 'session' } | { readonly kind: 'chat'; readonly chat: URI };

const continuationValidator = vObj({ identity: vString(), backingIdentity: vString(), destination: vString() });

function continuationMetadataKey(chat: string): string {
	return `agentHost.savedChatContinuation:${chat}`;
}

function readContinuation(raw: string | undefined) {
	if (raw === undefined) {
		return undefined;
	}
	const parsed = continuationValidator.validate(JSON.parse(raw));
	if (parsed.error) {
		throw new Error(`Invalid saved chat continuation: ${parsed.error.message}`);
	}
	return parsed.content;
}

/** Replay allocates response identifiers on each read; their content determines saved history identity. */
function savedResponseContent(part: ResponsePart) {
	if (part.kind === ResponsePartKind.ToolCall) {
		const { toolCallId: _toolCallId, ...toolCall } = part.toolCall;
		return { ...part, toolCall };
	}
	if (hasKey(part, { id: true })) {
		const { id: _id, ...content } = part;
		return content;
	}
	return part;
}

const legacyPeersValidator = vArray(vObj({
	uri: vString(),
	providerData: vOptionalProp(vString()),
	origin: vOptionalProp(vUnknown()),
	inheritedTurnId: vOptionalProp(vString()),
	workingDirectories: vOptionalProp(vArray(vString())),
	archived: vOptionalProp(vBoolean()),
}));

/** Resolves durable chat membership and projects saved history without installing live state. */
export class AgentHostSavedChatService {
	constructor(
		private readonly _readers: ReadonlyMap<AgentProvider, IAgentHostSavedChatReader>,
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _sessionStateStore: IAgentHostSessionStateStore,
		private readonly _logService: ILogService,
	) { }

	async readSavedChat(session: URI, chat?: URI, token = CancellationToken.None): Promise<IAgentHostSavedChat> {
		checkCancellation(token);
		const saved = await this._resolve(session, chat);
		const reader = this._readers.get(saved.provider);
		if (!reader) {
			throw new Error(`Saved chat reader is unavailable for ${saved.provider}`);
		}
		checkCancellation(token);
		const nativeTurns = await reader.read(saved.context, token);
		checkCancellation(token);
		const additionalWorktrees = await readSessionAdditionalWorktrees(this._sessionDataService, session);
		const [history, workspace] = await Promise.all([
			this._hydrate(saved, nativeTurns, additionalWorktrees),
			this._workspace(saved, additionalWorktrees),
		]);
		const current = await this._resolve(session, chat);
		if (current.identity !== saved.identity) {
			throw new Error('Saved chat identity changed while reading its history');
		}
		checkCancellation(token);
		const identity = createHash('sha256').update(stableStringify({
			backing: saved.identity,
			turns: history.turns.map(turn => ({ id: turn.id, message: turn.message, responseParts: turn.responseParts.map(savedResponseContent), state: turn.state })),
		})).digest('hex');
		const continuation = current.continuation?.identity === identity && await this._hasCopilotDestination(current.continuation.destination)
			? current.continuation : undefined;
		checkCancellation(token);
		return {
			session, chat: saved.context.chat, provider: saved.provider, identity,
			...(saved.context.origin ? { origin: saved.context.origin } : {}),
			availability: continuation ? { kind: 'continued', destination: URI.parse(continuation.destination, true) } : { kind: current.archived ? 'archived' : 'available' },
			title: saved.title, ...history, workspace,
		};
	}

	async completeSavedChatContinuation(
		request: IAgentHostSavedChatContinuation,
		archive: (target: AgentHostSavedChatArchiveTarget, validate: () => Promise<void>, previouslyArchived: boolean) => Promise<boolean>,
	): Promise<IAgentHostSavedChatContinuationResult> {
		const saved = await this._resolveContinuationSource(request);
		const destination = request.destination.toString();
		if (destination === request.session.toString() || !await this._hasCopilotDestination(destination)) {
			throw new Error('A saved chat continuation requires an existing Copilot destination');
		}
		const ref = await this._sessionDataService.tryOpenDatabase(request.session) ?? this._sessionDataService.openDatabase(request.session);
		try {
			const receiptKey = continuationMetadataKey(request.chat.toString());
			const observedReceipt = await ref.object.getMetadata(receiptKey);
			const observed = readContinuation(observedReceipt);
			const replaceableReceipt = observed?.identity === request.identity && observed.destination !== destination && await this._isMissingDestination(observed.destination)
				? observedReceipt : undefined;
			await this._resolveContinuationSource(request);
			await ref.object.updateMetadata(receiptKey, raw => {
				const previous = readContinuation(raw);
				// A competing completion may have replaced the receipt while its deleted destination was checked.
				if (previous?.identity === request.identity && previous.destination !== destination && raw !== replaceableReceipt) {
					throw new Error('Saved chat already continued to another Copilot destination');
				}
				return JSON.stringify({ identity: request.identity, backingIdentity: saved.identity, destination });
			});
			const current = await this._resolveContinuationSource(request);
			const target = await this._archiveTarget(current);
			if (!target) {
				return { archived: false };
			}
			const validate = async () => {
				const current = await this._resolveContinuationSource(request);
				const latest = await this._archiveTarget(current);
				if (latest?.kind !== target.kind || latest.kind === 'chat' && target.kind === 'chat' && latest.chat.toString() !== target.chat.toString()) {
					throw new Error('Saved chat membership changed before archival');
				}
			};
			await archive(target, validate, target.kind === 'session' ? current.sessionArchived : current.archived);
			return { archived: (await this._resolveContinuationSource(request)).archived };
		} finally {
			ref.dispose();
		}
	}

	private async _hasCopilotDestination(destination: string): Promise<boolean> {
		const [[target], registered, catalog, tombstoned] = await Promise.all([
			this._database.readCatalogSnapshot([destination]),
			this._database.getSessionV2Registration(destination),
			this._database.getSessionV2(destination),
			this._database.isSessionTombstoned(destination),
		]);
		return !!target && !!catalog && registered?.provider === COPILOT_CLI_AGENT_PROVIDER_ID && !target.provisional && !target.isChatBacking && !tombstoned;
	}

	private async _isMissingDestination(destination: string): Promise<boolean> {
		const [registered, tombstoned] = await Promise.all([
			this._database.getSessionV2Registration(destination),
			this._database.isSessionTombstoned(destination),
		]);
		return !registered || tombstoned;
	}

	private async _resolveContinuationSource(request: IAgentHostSavedChatContinuation): Promise<IResolvedSavedChat> {
		const saved = await this.readSavedChat(request.session, request.chat);
		if (saved.identity !== request.identity) {
			throw new Error('Saved chat identity changed before continuation completed');
		}
		return this._resolve(request.session, request.chat);
	}

	private async _archiveTarget(saved: IResolvedSavedChat): Promise<AgentHostSavedChatArchiveTarget | undefined> {
		const resolvedChats = await Promise.all(saved.publicChats.map(async chat => {
			try {
				const resolved = await this._resolve(saved.context.session, URI.parse(chat, true));
				const continued = !resolved.archived && resolved.continuation !== undefined
					&& (await this.readSavedChat(saved.context.session, resolved.context.chat)).availability.kind === 'continued';
				return { ...resolved, continued };
			} catch {
				return undefined;
			}
		}));
		const chats = coalesce(resolvedChats);
		if (chats.length !== saved.publicChats.length) {
			return undefined;
		}
		if (chats.every(chat => chat.archived || chat.continued)) {
			return { kind: 'session' };
		}
		if (saved.isDefault || saved.context.origin?.kind === ChatOriginKind.Tool || saved.context.origin?.kind === ChatOriginKind.SideChat) {
			return undefined;
		}
		const byChat = new Map(chats.map(chat => [chat.context.chat.toString(), chat]));
		for (const chat of chats.filter(chat => !chat.archived && !chat.continued)) {
			const visited = new Set<string>();
			let origin = chat.context.origin;
			while (origin && origin.kind !== ChatOriginKind.User && !visited.has(origin.chat)) {
				if (origin.chat === saved.context.chat.toString()) {
					return undefined;
				}
				visited.add(origin.chat);
				origin = byChat.get(origin.chat)?.context.origin;
			}
		}
		return { kind: 'chat', chat: saved.context.chat };
	}

	/** Resolves saved repository ownership for file previews, without decoding a native transcript. */
	async readWorkingDirectories(session: URI, owner: URI): Promise<readonly string[] | undefined> {
		if (await this._database.isSessionTombstoned(session.toString())) {
			throw new Error(`Saved session not found: ${session.toString()}`);
		}
		const registered = await this._database.getSessionV2Registration(session.toString());
		if (!registered || !this._readers.has(registered.provider)) {
			return undefined;
		}
		const folder = parseFolderChangesetOwnerUri(owner.toString());
		if (!folder) {
			const saved = await this._resolve(session, isAhpChatChannel(owner.toString()) ? owner : undefined);
			return saved.context.workingDirectories.map(directory => directory.toString());
		}
		const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
		if (!snapshot) {
			throw new Error(`Saved session not found: ${session.toString()}`);
		}
		let candidates: readonly string[];
		if (snapshot.authorityVersion === 2) {
			candidates = snapshot.chats.filter(chat => chat.order !== undefined).map(chat => chat.chat);
		} else {
			const saved = await this._resolve(session, undefined);
			const ref = await this._sessionDataService.tryOpenDatabase(session);
			try {
				const peers = await this._legacyPeers(session, await ref?.object.getMetadata(PEER_CHATS_METADATA_KEY));
				candidates = [saved.context.chat.toString(), ...peers.map(peer => peer.uri)];
			} finally {
				ref?.dispose();
			}
		}
		for (const candidate of candidates) {
			const saved = await this._resolve(session, URI.parse(candidate, true));
			const directories = saved.context.workingDirectories.map(directory => directory.toString());
			if (getWorkingDirectoryScopeId(directories) === folder.scopeId) {
				return directories;
			}
		}
		return [];
	}

	private async _resolve(session: URI, requestedChat: URI | undefined): Promise<IResolvedSavedChat> {
		const key = session.toString();
		const [[snapshot], catalog] = await Promise.all([
			this._database.readCatalogSnapshot([key]),
			this._database.getSessionV2(key),
		]);
		if (!snapshot || isAgentHostChatBacking(session, snapshot.isChatBacking) || snapshot.provisional || await this._database.isSessionTombstoned(key)) {
			throw new Error(`Saved session not found: ${key}`);
		}
		if (snapshot.identity.session !== key || catalog && (catalog.provider !== snapshot.identity.provider || snapshot.header?.sessionGeneration !== undefined && snapshot.header.sessionGeneration !== catalog.sessionGeneration)) {
			throw new Error(`Saved session catalog identity does not match: ${key}`);
		}
		const decoded = catalog ? decodeAgentHostCatalogPayloadData(catalog.payload) : undefined;
		if (decoded && !decoded.ok) {
			throw new Error(`Saved session catalog is invalid: ${decoded.error}`);
		}
		const data = decoded?.ok ? decoded.value : undefined;
		const defaultChat = snapshot.authorityVersion === 2 ? snapshot.header?.defaultChatUri
			: snapshot.header?.defaultChatUri ?? data?.chats.find(chat => chat.kind === 'default')?.uri ?? deriveLegacyDefaultChat(session);
		if (!defaultChat) {
			throw new Error(`Saved session has no default chat: ${key}`);
		}
		const chat = requestedChat ?? URI.parse(defaultChat, true);
		// Session state is read through the store, never importing a session that was not opened.
		const sessionState = await this._sessionStateStore.readWithoutImport(session, [SESSION_WORKING_DIRECTORIES_KEY, SESSION_CUSTOM_TITLE_KEY, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, customChatTitleMetadataKey(chat.toString())]);
		const ownerRef = await this._sessionDataService.tryOpenDatabase(session);
		try {
			const ownerMetadata: Record<string, string | undefined> = {
				...await ownerRef?.object.getMetadataObject({
					[continuationMetadataKey(chat.toString())]: true,
					defaultChatProviderData: true,
					[PEER_CHATS_METADATA_KEY]: true,
				}),
				...Object.fromEntries(sessionState),
			};
			const directories = parseSessionWorkingDirectories(ownerMetadata?.[SESSION_WORKING_DIRECTORIES_KEY]) ?? data?.workingDirectories ?? [];
			const legacyPeers = snapshot.authorityVersion === 2 ? undefined : await this._legacyPeers(session, ownerMetadata?.[PEER_CHATS_METADATA_KEY]);
			const context = await this._backing(session, chat, defaultChat, snapshot, directories, legacyPeers, ownerMetadata?.defaultChatProviderData);
			const parent = context.origin?.kind === ChatOriginKind.Tool
				? await this._backing(session, URI.parse(context.origin.chat, true), defaultChat, snapshot, directories, legacyPeers, ownerMetadata?.defaultChatProviderData)
				: undefined;
			const normalized = snapshot.chats.find(entry => entry.chat === chat.toString());
			const isDefault = chat.toString() === defaultChat;
			const title = normalized?.metadata?.summary ?? ownerMetadata?.[customChatTitleMetadataKey(chat.toString())]
				?? data?.chats.find(entry => entry.uri === chat.toString())?.summary
				?? (isDefault ? ownerMetadata?.[SESSION_CUSTOM_TITLE_KEY] ?? data?.summary : undefined) ?? '';
			const persistedWorkspaceless = ownerMetadata?.[AH_META_WORKSPACELESS_DB_KEY];
			const identity = createHash('sha256').update(stableStringify({
				provider: snapshot.identity.provider,
				generation: catalog?.sessionGeneration,
				startTime: snapshot.identity.startTime,
				defaultChat,
				ownershipRevision: normalized?.ownershipRevision,
				context: backingIdentity(context),
				parent: parent ? backingIdentity(parent) : undefined,
			})).digest('hex');
			const receipt = readContinuation(ownerMetadata?.[continuationMetadataKey(chat.toString())]);
			const sessionArchived = ownerMetadata?.[AH_META_IS_ARCHIVED_DB_KEY] !== undefined ? ownerMetadata[AH_META_IS_ARCHIVED_DB_KEY] === 'true' : data?.isArchived === true;
			return {
				context: parent ? { ...context, parent } : context,
				provider: snapshot.identity.provider,
				title,
				isDefault,
				workspaceless: persistedWorkspaceless !== undefined ? persistedWorkspaceless === 'true' : readSessionWorkspaceless(data?._meta),
				identity,
				archived: sessionArchived || normalized?.archived === true || legacyPeers?.some(peer => peer.uri === chat.toString() && peer.archived) === true,
				sessionArchived,
				continuation: receipt?.backingIdentity === identity ? receipt : undefined,
				publicChats: snapshot.authorityVersion === 2
					? snapshot.chats.filter(chat => chat.order !== undefined).map(chat => chat.chat)
					: [defaultChat, ...(legacyPeers ?? []).filter(peer => peer.origin?.kind !== ChatOriginKind.Tool).map(peer => peer.uri)],
			};
		} finally {
			ownerRef?.dispose();
		}
	}

	private async _backing(session: URI, chat: URI, defaultChat: string, snapshot: IAgentHostDatabaseCatalogSnapshotEntry, directories: readonly string[], legacyPeers: readonly IPersistedPeerChat[] | undefined, legacyDefaultProviderData: string | undefined): Promise<IAgentHostSavedChatBacking> {
		const key = chat.toString();
		let normalized: IAgentHostDatabaseChatV2 | undefined;
		let providerData: string | undefined;
		let origin: ChatOrigin | undefined;
		let inheritedTurnId: string | undefined;
		let workingDirectories: readonly string[] | undefined;
		let storageResource: URI;
		if (snapshot.authorityVersion === 2) {
			normalized = snapshot.chats.find(entry => entry.chat === key);
			if (!normalized || normalized.ownerSession !== session.toString()) {
				throw new Error(`Saved chat does not belong to this session: ${key}`);
			}
			const detail = await this._database.getChatV2ProviderDetail(key);
			if (!detail) {
				throw new Error(`Saved chat backing not found: ${key}`);
			}
			storageResource = URI.parse(normalized.storageResource ?? (key === defaultChat ? session.toString() : key), true);
			providerData = detail.providerData;
			origin = readOrigin(normalized.origin);
			inheritedTurnId = normalized.inheritedTurnId;
			workingDirectories = normalized.workingDirectories;
		} else {
			if (!isAhpChatChannel(key)) {
				throw new Error(`Invalid saved chat URI: ${key}`);
			}
			const peer = legacyPeers?.find(entry => entry.uri === key);
			if (key !== defaultChat && !peer) {
				throw new Error(`Saved chat not found: ${key}`);
			}
			storageResource = key === defaultChat ? session : chat;
			const ref = await this._sessionDataService.tryOpenDatabase(storageResource);
			try {
				const metadata = await ref?.object.getMetadataObject({
					[CHAT_PROVIDER_DATA_METADATA_KEY]: true,
					[CHAT_ORIGIN_METADATA_KEY]: true,
					[CHAT_INHERITED_TURN_METADATA_KEY]: true,
					[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: true,
				});
				providerData = peer?.providerData ?? metadata?.[CHAT_PROVIDER_DATA_METADATA_KEY] ?? (key === defaultChat ? legacyDefaultProviderData : undefined);
				origin = peer?.origin ?? readOrigin(metadata?.[CHAT_ORIGIN_METADATA_KEY]);
				inheritedTurnId = peer?.inheritedTurnId ?? metadata?.[CHAT_INHERITED_TURN_METADATA_KEY];
				workingDirectories = peer?.workingDirectories ?? parseSessionWorkingDirectories(metadata?.[CHAT_WORKING_DIRECTORIES_METADATA_KEY] || undefined);
			} finally {
				ref?.dispose();
			}
		}
		return {
			session, chat, storageResource, providerData, origin,
			...(inheritedTurnId !== undefined ? { inheritedTurnId } : {}),
			workingDirectories: (workingDirectories ?? directories).map(directory => URI.parse(directory, true)),
		};
	}

	private async _legacyPeers(session: URI, raw: string | undefined): Promise<readonly IPersistedPeerChat[]> {
		const catalog = await this._database.getSessionChatCatalog(session.toString());
		if (catalog) {
			return catalog.chats.map(entry => ({ ...entry, uri: entry.chat, origin: readOrigin(entry.origin) }));
		}
		if (raw === undefined) {
			return [];
		}
		const parsed = legacyPeersValidator.validate(JSON.parse(raw));
		if (parsed.error) {
			throw new Error(`Invalid saved chat catalog: ${parsed.error.message}`);
		}
		return parsed.content.map(entry => ({ ...entry, origin: readOriginValue(entry.origin) }));
	}

	private async _hydrate(saved: IResolvedSavedChat, nativeTurns: readonly Turn[], worktrees: readonly ISessionAdditionalWorktree[]): Promise<Pick<IAgentHostSavedChat, 'turns' | 'draft'>> {
		const { session, chat, storageResource, origin, inheritedTurnId } = saved.context;
		const owner = await this._sessionDataService.tryOpenDatabase(session);
		let storage: IReference<ISessionDatabase> | undefined;
		try {
			storage = await this._sessionDataService.tryOpenDatabase(storageResource);
			const [persisted, draft, usages, delegations, transitions] = await Promise.all([
				owner?.object.getPersistedTurns() ?? [],
				owner?.object.getChatDraft(chat),
				storage?.object.getTurnUsages() ?? new Map<string, string>(),
				storage?.object.getTurnDelegations() ?? new Map<string, string>(),
				storage?.object.getTurnWorkspaceTransitions() ?? new Map<string, string>(),
			]);
			const records = persisted.filter(record => record.chatUri === chat.toString());
			if (records.some(record => !parsePersistedTurn(record, this._logService, AgentHostSavedChatService.name))) {
				throw new Error(`Saved host history is invalid for ${chat.toString()}`);
			}
			let turns = applyPersistedTurnDelegations(nativeTurns, delegations);
			if (origin?.kind !== ChatOriginKind.Tool) {
				turns = applyPersistedTurnUsage(turns, usages);
			}
			turns = applyPersistedFailedTurns(turns, records.filter(record => record.kind === 'failed'), this._logService);
			turns = applySavedWorkspaceTransitions(turns, transitions);
			const ownedWorktree = worktrees.find(worktree => worktree.chat === chat.toString());
			const noticeResource = saved.isDefault ? session : ownedWorktree ? detachedWorktreeRecordUri(ownedWorktree.handle) : undefined;
			if (noticeResource) {
				turns = await applySavedWorktreeAnnouncement(this._sessionDataService, noticeResource, turns);
			}
			if (origin?.kind === ChatOriginKind.SideChat) {
				const boundary = { ...(inheritedTurnId !== undefined ? { inheritedTurnId } : {}) };
				if (resolveSideChatBoundary(turns, boundary) !== turns.length) {
					turns = sliceSideChatTurns(turns, boundary);
				}
			}
			return { turns: interleaveLocalTurns(turns, records.filter(record => record.kind === 'local'), this._logService), ...(draft ? { draft } : {}) };
		} finally {
			owner?.dispose();
			storage?.dispose();
		}
	}

	private async _workspace(saved: IResolvedSavedChat, additionalWorktrees: readonly ISessionAdditionalWorktree[]): Promise<AgentHostSavedChatWorkspace> {
		const { workingDirectories, session } = saved.context;
		if (saved.workspaceless || workingDirectories.length === 0) {
			return { kind: 'none' };
		}
		const main = await readPersistedWorktreeMetadata(this._sessionDataService, session, this._logService);
		const owned = [
			...(main?.worktreePath ? [{ directory: main.worktreePath, repository: main.repositoryRoot }] : []),
			...additionalWorktrees.map(worktree => ({ directory: URI.parse(worktree.workingDirectory, true), repository: URI.parse(worktree.repositoryRoot, true) })),
		];
		if (!workingDirectories.some(directory => owned.some(worktree => isEqualOrParent(directory, worktree.directory)))) {
			return { kind: 'folder', workingDirectories };
		}
		const suggestedDirectories = workingDirectories.flatMap(directory => {
			const worktree = owned.find(worktree => isEqualOrParent(directory, worktree.directory));
			if (!worktree) {
				return [directory];
			}
			return worktree.repository ? [joinPath(worktree.repository, relativePath(worktree.directory, directory) ?? '')] : [];
		});
		return { kind: 'managed', workingDirectories, managedDirectories: owned.map(worktree => worktree.directory), suggestedDirectories };
	}
}

function backingIdentity(backing: IAgentHostSavedChatBacking) {
	return {
		...backing,
		session: backing.session.toString(),
		chat: backing.chat.toString(),
		storageResource: backing.storageResource.toString(),
		workingDirectories: backing.workingDirectories.map(directory => directory.toString()),
	};
}

function readOrigin(raw: string | undefined): ChatOrigin | undefined {
	return raw ? readOriginValue(JSON.parse(raw)) : undefined;
}

function readOriginValue(value: unknown): ChatOrigin | undefined {
	if (value === undefined) {
		return undefined;
	}
	const origin = fromCatalogChatOrigin(toSerializableJsonValue(value));
	if (!origin) {
		throw new Error('Invalid saved chat origin');
	}
	return origin;
}

function checkCancellation(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
