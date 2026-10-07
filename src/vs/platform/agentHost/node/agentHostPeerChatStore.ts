/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Limiter } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { basename } from '../../../base/common/path.js';
import { isUUID } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AgentSession, COPILOT_CLI_AGENT_PROVIDER_ID } from '../common/agent.js';
import type { AgentHostCatalogDatabaseReference } from './agentHostCatalogSyncService.js';
import { ChatInteractivity, ChatOrigin } from '../common/state/protocol/state.js';
import { AH_META_DEFAULT_CHAT_IS_READ_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY, buildChatUri, isDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../common/state/sessionState.js';
import { fromCatalogChatOrigin, toCatalogSummary, toSerializableJsonValue } from './agentHostCatalogSourceResolver.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT, agentHostCatalogChangesValidator } from './agentHostCatalogProjection.js';
import { IAgentHostDatabase, type IAgentHostDatabaseCatalogSnapshotEntry, type IAgentHostDatabaseChatV2, type IAgentHostDatabaseChatV2Patch, type IAgentHostDatabaseChatV2NormalizationChat, type IAgentHostDatabaseChatV2NormalizationCandidate, type IAgentHostDatabaseChatV2Mutation } from './agentHostDatabase.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';
import { getChatChangesSummaryMetadataKey, META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';

export const PEER_CHATS_METADATA_KEY = 'peerChats';
export const CHAT_PROVIDER_DATA_METADATA_KEY = 'agentHost.chatProviderData';
export const CHAT_ORIGIN_METADATA_KEY = 'agentHost.chatOrigin';
export const CHAT_INHERITED_TURN_METADATA_KEY = 'agentHost.chatInheritedTurnId';
export const CHAT_WORKING_DIRECTORIES_METADATA_KEY = 'agentHost.chatWorkingDirectories';
const CHAT_METADATA_CONCURRENCY = 4;
const IMPORTED_PEER_CHAT_LIMIT = AGENT_HOST_CATALOG_CHILD_LIMIT - 1;

export const IAgentHostPeerChatPersistenceService = createDecorator<IAgentHostPeerChatPersistenceService>('agentHostPeerChatPersistenceService');

export interface IAgentHostPeerChatPersistenceService {
	readonly _serviceBrand: undefined;
	setRead(session: URI, chat: URI, isRead: boolean): Promise<void>;
	setArchived(session: URI, chat: URI, archived: boolean): Promise<void>;
	persistMetadata(session: URI, resource: URI, values: Readonly<Record<string, string>>): Promise<void>;
	persistDefaultChatTitleSnapshot(session: URI, chat: URI, title: string): Promise<void>;
	readNormalizedChat(session: URI, chat: URI): Promise<{ readonly normalized: boolean; readonly chat?: IAgentHostDatabaseChatV2 }>;
}

export interface IPersistedPeerChat {
	readonly uri: string;
	readonly isRead?: boolean;
	readonly archived?: boolean;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
	readonly inheritedTurnId?: string;
	readonly workingDirectories?: readonly string[];
}

interface IReplaceCentralOptions {
	readonly publishCompatibility?: boolean;
	readonly database?: AgentHostCatalogDatabaseReference;
	readonly previousEntries?: readonly IPersistedPeerChat[];
	readonly legacyMergeBase?: readonly IPersistedPeerChat[];
}

export class AgentHostPeerChatStore implements IAgentHostPeerChatPersistenceService {

	declare readonly _serviceBrand: undefined;

	private readonly _writes = new Map<string, Promise<void>>();
	private readonly _metadataWrites = new Set<Promise<void>>();
	private readonly _deletingSessions = new Map<string, number>();
	private _metadataMigration: ((session: URI, resource: URI, values: Readonly<Record<string, string>>) => Promise<Readonly<Record<string, string>>>) | undefined;

	constructor(
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
	) { }

	setMetadataMigration(handler: NonNullable<AgentHostPeerChatStore['_metadataMigration']>): void {
		if (this._metadataMigration) {
			throw new Error('Chat metadata migration is already configured');
		}
		this._metadataMigration = handler;
	}

	prepareMetadataMutation(session: URI, resource: URI, values: Readonly<Record<string, string>>, candidate: IAgentHostDatabaseChatV2NormalizationCandidate): { mutation?: IAgentHostDatabaseChatV2Mutation; remaining: Readonly<Record<string, string>> } {
		const remaining: Record<string, string> = {};
		let target: IAgentHostDatabaseChatV2NormalizationChat | undefined;
		let patch: IAgentHostDatabaseChatV2Patch = {};
		for (const [key, value] of Object.entries(values)) {
			const chatUri = this._metadataChatUri(session, resource, key, candidate.defaultChat.chat);
			const chat = [candidate.defaultChat, ...candidate.peers, ...candidate.privateDescendants].find(entry => entry.chat === chatUri);
			const next = chat && this._metadataPatch({ ...chat, metadata: patch.metadata ?? chat.metadata }, key, value);
			if (!next) {
				remaining[key] = value;
				continue;
			}
			if (target && target.chat !== chat.chat) {
				return { remaining: values };
			}
			target = chat;
			patch = { ...patch, ...next };
		}
		return { mutation: target ? { chat: target.chat, expected: { ownershipRevision: 0, metadataRevision: 0 }, patch } : undefined, remaining };
	}

	async whenIdle(): Promise<void> {
		while (this._writes.size || this._metadataWrites.size) {
			await Promise.all([...this._writes.values(), ...this._metadataWrites]);
		}
	}

	private _trackMetadataWrite(operation: () => Promise<void>): Promise<void> {
		const tracked = operation().finally(() => this._metadataWrites.delete(tracked));
		this._metadataWrites.add(tracked);
		return tracked;
	}

	persistPrivateChat(session: URI, chat: IAgentHostDatabaseChatV2NormalizationChat, restore = false): Promise<void> {
		return this._enqueue(session, async () => {
			while (true) {
				const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
				if (snapshot?.authorityVersion !== 2) {
					return;
				}
				if (!snapshot.header) {
					throw new Error(`Missing normalized header for ${session.toString()}`);
				}
				const existing = snapshot.chats.find(row => row.chat === chat.chat);
				if (existing && (existing.order !== undefined || existing.metadata?.interactivity !== ChatInteractivity.Hidden)) {
					throw new Error(`Cannot replace public chat ${chat.chat} with a private chat`);
				}
				if (restore && existing) {
					return;
				}
				let metadata = chat.metadata;
				if (restore) {
					const chatRef = await this._sessionDataService.tryOpenDatabase(URI.parse(chat.chat));
					let title: string | undefined;
					let titleSource: string | undefined;
					try {
						title = await chatRef?.object.getMetadata(SESSION_CUSTOM_TITLE_KEY);
						titleSource = await chatRef?.object.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY);
					} finally {
						chatRef?.dispose();
					}
					const sessionRef = await this._sessionDataService.tryOpenDatabase(session);
					try {
						title ??= await sessionRef?.object.getMetadata(customChatTitleMetadataKey(chat.chat));
						titleSource ??= await sessionRef?.object.getMetadata(customChatTitleSourceMetadataKey(chat.chat));
					} finally {
						sessionRef?.dispose();
					}
					metadata = {
						...metadata,
						...(title !== undefined ? { summary: toCatalogSummary(title) } : {}),
						...(titleSource === 'user' || titleSource === 'agent' || titleSource === 'auto' ? { titleSource } : {}),
					};
				}
				const result = existing
					? await this._database.updateChatV2Metadata(chat.chat, existing, {
						...(chat.parentChat !== undefined ? { parentChat: chat.parentChat } : {}),
						...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
						...(chat.origin !== undefined ? { origin: chat.origin } : {}),
						...(chat.workingDirectories !== undefined ? { workingDirectories: chat.workingDirectories } : {}),
						metadata: { ...existing.metadata, ...metadata, interactivity: ChatInteractivity.Hidden },
					})
					: await this._database.insertPrivateChatV2(session.toString(), { ...chat, metadata }, snapshot.header.revision);
				if (result.status === 'conflict') {
					const [current] = await this._database.readCatalogSnapshot([session.toString()]);
					if (current?.header?.revision === snapshot.header.revision) {
						throw new Error(`Conflicting private chat identity ${chat.chat}`);
					}
					continue;
				}
				if (result.status !== 'applied' && result.status !== 'replayed') {
					throw new Error(`Failed to persist private chat ${chat.chat}: ${result.status}`);
				}
				return;
			}
		});
	}

	async runExclusive<T>(session: URI, operation: () => Promise<T>): Promise<T> {
		let result: { value: T } | undefined;
		await this._enqueue(session, async () => { result = { value: await operation() }; });
		if (!result) {
			throw new Error(`Chat catalog operation fenced during deletion of ${session.toString()}`);
		}
		return result.value;
	}

	async readNormalizedChat(session: URI, chat: URI): Promise<{ readonly normalized: boolean; readonly chat?: IAgentHostDatabaseChatV2 }> {
		return this._database.readChatV2(session.toString(), chat.toString());
	}

	persistMetadata(session: URI, resource: URI, values: Readonly<Record<string, string>>): Promise<void> {
		return this._trackMetadataWrite(() => this._persistMetadata(session, resource, values));
	}

	persistDefaultChatTitleSnapshot(session: URI, chat: URI, title: string): Promise<void> {
		return this._trackMetadataWrite(() => this._enqueue(session, async () => {
			while (true) {
				const current = await this.readNormalizedChat(session, chat);
				if (!current.normalized) {
					if (await this._database.isSessionTombstoned(session.toString())) {
						throw new Error(`Cannot snapshot a default title for deleted session ${session.toString()}`);
					}
					const ref = this._sessionDataService.openDatabase(session);
					try {
						const key = customChatTitleMetadataKey(chat.toString());
						await ref.object.setMetadataValuesIfAbsent(key, { [key]: title }, {
							[customChatTitleSourceMetadataKey(chat.toString())]: SESSION_CUSTOM_TITLE_SOURCE_KEY,
						});
					} finally {
						ref.dispose();
					}
					return;
				}
				if (!current.chat) {
					throw new Error(`Cannot snapshot a title for missing normalized chat ${chat.toString()}`);
				}
				if (current.chat.metadata?.summary !== undefined) {
					return;
				}
				const metadata = { ...current.chat.metadata, summary: toCatalogSummary(title) };
				const ref = await this._sessionDataService.tryOpenDatabase(session);
				if (ref) {
					try {
						const source = await ref.object.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY);
						if (source === 'user' || source === 'agent' || source === 'auto') {
							metadata.titleSource ??= source;
						}
					} finally {
						ref.dispose();
					}
				}
				const result = await this._database.updateChatV2Metadata(chat.toString(), current.chat, { metadata });
				if (result.status === 'conflict') {
					continue;
				}
				if (result.status !== 'applied' && result.status !== 'replayed') {
					throw new Error(`Failed to snapshot normalized title for ${chat.toString()}: ${result.status}`);
				}
				return;
			}
		}));
	}

	private async _persistMetadata(session: URI, resource: URI, values: Readonly<Record<string, string>>): Promise<void> {
		values = await this._metadataMigration?.(session, resource, values) ?? values;
		if (!Object.keys(values).length) {
			return;
		}
		return this._enqueue(session, async () => {
			while (true) {
				const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
				if (snapshot?.authorityVersion !== 2) {
					const ref = this._sessionDataService.openDatabase(resource);
					try {
						const entries = Object.entries(values);
						if (entries.length === 1) {
							await ref.object.setMetadata(entries[0][0], entries[0][1]);
						} else {
							await ref.object.setMetadataValues(values);
						}
					} finally {
						ref.dispose();
					}
					return;
				}
				const legacy: Record<string, string> = {};
				const patches = new Map<string, { chat: IAgentHostDatabaseChatV2; patch: IAgentHostDatabaseChatV2Patch }>();
				let conflict = false;
				for (const [key, value] of Object.entries(values)) {
					const chatUri = this._metadataChatUri(session, resource, key, snapshot.header?.defaultChatUri);
					if (!chatUri) {
						legacy[key] = value;
						continue;
					}
					const pending = patches.get(chatUri);
					const chat = pending?.chat ?? snapshot.chats.find(row => row.chat === chatUri);
					if (!chat) {
						throw new Error(`Cannot persist metadata for missing normalized chat ${chatUri}`);
					}
					const patch = this._metadataPatch({ ...chat, metadata: pending?.patch.metadata ?? chat.metadata }, key, value);
					if (!patch) {
						legacy[key] = value;
						continue;
					}
					patches.set(chatUri, { chat, patch: { ...pending?.patch, ...patch } });
				}
				for (const [chatUri, { chat, patch }] of patches) {
					const result = await this._database.updateChatV2Metadata(chatUri, chat, patch);
					if (result.status === 'conflict') {
						conflict = true;
						break;
					}
					if (result.status !== 'applied' && result.status !== 'replayed') {
						throw new Error(`Failed to persist normalized metadata for ${chatUri}: ${result.status}`);
					}
				}
				if (conflict) {
					continue;
				}
				if (Object.keys(legacy).length) {
					const ref = this._sessionDataService.openDatabase(resource);
					try {
						await ref.object.setMetadataValues(legacy);
					} finally {
						ref.dispose();
					}
				}
				return;
			}
		});
	}

	private _metadataChatUri(session: URI, resource: URI, key: string, defaultChat: string | undefined): string | undefined {
		return resource.toString() !== session.toString() ? resource.toString()
			: key.startsWith('customChatTitle:') ? key.slice('customChatTitle:'.length)
				: key.startsWith('customChatTitleSource:') ? key.slice('customChatTitleSource:'.length)
					: key.startsWith(`${META_CHANGES_SUMMARY}:`) ? key.slice(META_CHANGES_SUMMARY.length + 1)
						: key === AH_META_DEFAULT_CHAT_IS_READ_DB_KEY ? defaultChat : undefined;
	}

	private _metadataPatch(chat: Pick<IAgentHostDatabaseChatV2, 'chat' | 'metadata'>, key: string, value: string): IAgentHostDatabaseChatV2Patch | undefined {
		if (key === SESSION_CUSTOM_TITLE_KEY || key === customChatTitleMetadataKey(chat.chat)) {
			return { metadata: { ...chat.metadata, summary: toCatalogSummary(value) } };
		}
		if (key === SESSION_CUSTOM_TITLE_SOURCE_KEY || key === customChatTitleSourceMetadataKey(chat.chat)) {
			if (value !== '' && value !== 'user' && value !== 'agent' && value !== 'auto') {
				throw new Error(`Invalid title source for ${chat.chat}`);
			}
			return { metadata: { ...chat.metadata, titleSource: value || undefined } };
		}
		if (key === getChatChangesSummaryMetadataKey(chat.chat)) {
			const changes = value ? agentHostCatalogChangesValidator.validate(JSON.parse(value)) : undefined;
			if (changes?.error) {
				throw new Error(`Invalid changes summary for ${chat.chat}: ${changes.error.message}`);
			}
			return { metadata: { ...chat.metadata, changes: changes?.content } };
		}
		switch (key) {
			case CHAT_PROVIDER_DATA_METADATA_KEY: return { providerData: value || null };
			case CHAT_ORIGIN_METADATA_KEY: return { origin: value || null };
			case CHAT_INHERITED_TURN_METADATA_KEY: return { inheritedTurnId: value || null };
			case CHAT_WORKING_DIRECTORIES_METADATA_KEY: return { workingDirectories: value ? this._parseWorkingDirectories(value) : null };
			case AH_META_IS_READ_DB_KEY:
			case AH_META_DEFAULT_CHAT_IS_READ_DB_KEY: return { isRead: value === 'true' };
			case AH_META_IS_ARCHIVED_DB_KEY: return { archived: value === 'true' };
		}
		return undefined;
	}

	private async _normalizedEntries(snapshot: IAgentHostDatabaseCatalogSnapshotEntry): Promise<IPersistedPeerChat[]> {
		return Promise.all(snapshot.chats.filter(chat => chat.order !== undefined && chat.chat !== snapshot.header?.defaultChatUri).map(async chat => ({
			uri: chat.chat,
			isRead: chat.isRead,
			archived: chat.archived,
			origin: chat.origin === undefined ? undefined : this._parseOrigin(chat.origin),
			inheritedTurnId: chat.inheritedTurnId,
			workingDirectories: chat.workingDirectories,
			...(await this._database.getChatV2ProviderDetail(chat.chat)),
		})));
	}

	async tryRead(session: URI, repairLegacyMirror = true): Promise<IPersistedPeerChat[] | undefined> {
		return this._readCentral(session, repairLegacyMirror);
	}

	/** Checks the durable completion marker without discovering or restoring any chats. */
	async hasCompletedChatSelectionRecovery(session: URI): Promise<boolean> {
		if ((await this._database.readCatalogSnapshot([session.toString()]))[0]?.authorityVersion === 2) {
			return true;
		}
		const database = await this._sessionDataService.tryOpenDatabase(session);
		if (!database) {
			return false;
		}
		try {
			const raw = await database.object.getMetadata('agentHost.peerChatRecovery339409');
			return raw !== undefined && this._parseRecoveryBackup(raw).completed === true;
		} finally {
			database.dispose();
		}
	}

	/** Recovers legacy peer membership only when a restored chat-selection phantom is independently verified. */
	async recoverChatSelectionCorruption(session: URI, phantomChatIds: readonly string[]): Promise<{ readonly entries: readonly IPersistedPeerChat[]; readonly verifiedPhantomChatIds: readonly string[] } | undefined> {
		if ((await this._database.readCatalogSnapshot([session.toString()]))[0]?.authorityVersion === 2) {
			return undefined;
		}
		if (AgentSession.provider(session) !== COPILOT_CLI_AGENT_PROVIDER_ID || session.authority || session.query || session.fragment || !isUUID(session.path.slice(1)) || !this._sessionDataService.listSessionDataIds) {
			return undefined;
		}
		const dataIds = await this._sessionDataService.listSessionDataIds('');
		let recovered: { readonly entries: readonly IPersistedPeerChat[]; readonly verifiedPhantomChatIds: readonly string[] } | undefined;
		await this._enqueue(session, async () => {
			const parent = await this._sessionDataService.tryOpenDatabase(session);
			if (!parent) {
				return;
			}
			try {
				const catalog = await this._database.getSessionChatCatalog(session.toString());
				if (!catalog) {
					return;
				}
				const backupKey = 'agentHost.peerChatRecovery339409';
				const rawBackup = await parent.object.getMetadata(backupKey);
				const backup = rawBackup === undefined ? undefined : this._parseRecoveryBackup(rawBackup);
				const legacy = await parent.object.getMetadata(PEER_CHATS_METADATA_KEY);
				const shouldRecover = !backup?.completed && (backup !== undefined || legacy?.trim() === '[]');
				const sample = URI.parse(buildChatUri(session, 'recovery'));
				const suffix = basename(this._sessionDataService.getSessionDataDir(sample).path).slice('recovery'.length);
				const eligible: IPersistedPeerChat[] = [];
				const verifiedPhantomChatIds: string[] = [];
				const selectedIds = new Set(phantomChatIds.filter(isUUID));
				const titleSources = new Set(['user', 'auto', 'agent']);
				for (const id of [...dataIds].sort()) {
					if (!id.endsWith(suffix)) {
						continue;
					}
					const chatId = id.slice(0, -suffix.length);
					const selected = selectedIds.has(chatId);
					if (!isUUID(chatId) || (!shouldRecover && !selected)) {
						continue;
					}
					const chat = URI.parse(buildChatUri(session, chatId));
					const uri = chat.toString();
					if (this._sessionDataService.getSessionDataDir(chat).path !== this._sessionDataService.getSessionDataDirById(id).path) {
						continue;
					}
					const metadata = await parent.object.getMetadataObject({
						[customChatTitleMetadataKey(uri)]: true,
						[customChatTitleSourceMetadataKey(uri)]: true,
					});
					const deleted = metadata[customChatTitleMetadataKey(uri)] === '' && metadata[customChatTitleSourceMetadataKey(uri)] === '';
					const remembered = metadata[customChatTitleMetadataKey(uri)] && titleSources.has(metadata[customChatTitleSourceMetadataKey(uri)] ?? '');
					if (!selected && (!remembered || deleted || (backup && !backup.recovered.includes(uri)))) {
						continue;
					}
					const backing = await this._sessionDataService.tryOpenDatabase(chat);
					if (!backing) {
						continue;
					}
					try {
						if (!await backing.object.getMetadata(CHAT_PROVIDER_DATA_METADATA_KEY)) {
							continue;
						}
					} finally {
						backing.dispose();
					}
					if (selected) {
						verifiedPhantomChatIds.push(chatId);
					}
					if (shouldRecover && !deleted && (!backup || backup.recovered.includes(uri))) {
						eligible.push(await this._readChatMetadata({ uri }));
					}
				}
				if (verifiedPhantomChatIds.length === 0) {
					return;
				}
				const current = this._entriesFromCatalog(catalog.chats);
				if (!shouldRecover) {
					recovered = { entries: await this._readWorkingDirectories(current), verifiedPhantomChatIds };
					return;
				}
				const currentCatalog = await this._database.getSessionChatCatalog(session.toString());
				if (!currentCatalog) {
					return;
				}
				const recoveryRevision = backup?.revision ?? catalog.revision;
				const missing = eligible.filter(candidate => !current.some(entry => entry.uri === candidate.uri));
				const entries = [...current, ...missing];
				if (!backup) {
					await parent.object.setMetadata(backupKey, JSON.stringify({
						entries: current,
						legacy,
						recovered: eligible.map(entry => entry.uri),
						revision: recoveryRevision,
					}));
				}
				if (missing.length > 0 && currentCatalog.revision === recoveryRevision) {
					const result = await this._database.recoverSessionChatCatalog(session.toString(), this._catalogRows(entries), recoveryRevision);
					if (result.status === 'conflict') {
						this._logService.warn(`[AgentHostPeerChatStore] Catalogue changed during recovery; preserving current membership for ${session.toString()}`);
					} else if (result.status !== 'applied') {
						return;
					}
				} else if (missing.length > 0 && currentCatalog.revision !== recoveryRevision) {
					this._logService.warn(`[AgentHostPeerChatStore] Catalogue changed since recovery was prepared; preserving current membership for ${session.toString()}`);
				}
				while (true) {
					const latest = await this._database.getSessionChatCatalog(session.toString());
					if (!latest) {
						return;
					}
					const entries = await this._readWorkingDirectories(this._entriesFromCatalog(latest.chats));
					if (!await this._writeLegacyMirror(session, entries, latest.revision, parent)) {
						continue;
					}
					const saved = await parent.object.getMetadata(backupKey);
					if (saved === undefined) {
						throw new Error(`Missing peer-chat recovery backup for ${session.toString()}`);
					}
					await parent.object.setMetadata(backupKey, JSON.stringify({ ...this._parseRecoveryBackup(saved), completed: true }));
					recovered = { entries, verifiedPhantomChatIds };
					const restoredCount = entries.filter(entry => !current.some(previous => previous.uri === entry.uri)).length;
					if (restoredCount < missing.length) {
						this._logService.warn(`[AgentHostPeerChatStore] Skipped ${missing.length - restoredCount} recovery candidates due to current ownership or concurrent changes for ${session.toString()}`);
					}
					this._logService.info(`[AgentHostPeerChatStore] Recovered ${restoredCount} peer chats affected by #339409 for ${session.toString()}`);
					return;
				}
			} finally {
				parent.dispose();
			}
		});
		return recovered;
	}

	private _parseRecoveryBackup(raw: string): { readonly recovered: readonly string[]; readonly completed?: boolean; readonly entries: readonly unknown[]; readonly legacy?: string; readonly revision: number } {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('Invalid peer-chat recovery backup');
		}
		const value = parsed as Record<string, unknown>;
		if (!Array.isArray(value.recovered) || !value.recovered.every(uri => typeof uri === 'string')
			|| !Array.isArray(value.entries)
			|| typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision <= 0
			|| (value.completed !== undefined && typeof value.completed !== 'boolean')
			|| (value.legacy !== undefined && typeof value.legacy !== 'string')) {
			throw new Error('Invalid peer-chat recovery backup');
		}
		return {
			recovered: value.recovered,
			entries: value.entries,
			revision: value.revision,
			...(typeof value.completed === 'boolean' ? { completed: value.completed } : {}),
			...(typeof value.legacy === 'string' ? { legacy: value.legacy } : {}),
		};
	}

	/** Imports membership changed by an older build, then returns central authority. */
	async reconcileLegacy(session: URI, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[] | undefined> {
		let result: IPersistedPeerChat[] | undefined;
		await this._enqueue(session, async () => {
			while (true) {
				const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
				if (snapshot?.authorityVersion === 2) {
					result = await this._normalizedEntries(snapshot);
					return;
				}
				const catalog = await this._database.getSessionChatCatalog(session.toString());
				const legacyState = await this._tryReadLegacyPayload(session, false, database);
				const legacy = legacyState?.entries;
				if (!catalog) {
					if (legacy === undefined) {
						return;
					}
					const replaceResult = await this._replaceCentral(session, legacy, undefined, { database, legacyMergeBase: legacy });
					if (replaceResult === 'conflict') {
						continue;
					}
					if (replaceResult === 'sessionUnavailable') {
						return;
					}
					result = legacy;
					return;
				}
				const central = this._entriesFromCatalog(catalog.chats);
				if (catalog.legacyMirroredRevision !== catalog.revision) {
					const reconciled = await this._reconcileUnmirroredCatalog(session, database);
					result = reconciled.status === 'available' ? reconciled.entries : undefined;
					return;
				}
				if (legacy === undefined) {
					try {
						await this._publishCompatibilityState(session, central, catalog.revision, database);
					} catch (error) {
						this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
					}
				}
				if (legacy !== undefined && catalog.legacyMirroredPayload === undefined) {
					if (!await this._database.markSessionChatCatalogLegacyMirrored(session.toString(), catalog.revision, JSON.stringify(legacy))) {
						continue;
					}
				}
				if (legacy !== undefined && legacyState?.raw !== catalog.legacyMirroredPayload) {
					const base = this._parseLegacyMirrorBase(session, catalog.legacyMirroredPayload);
					const merged = base === undefined ? legacy : this._mergeLegacyChanges(base, central, legacy);
					const replaceResult = await this._replaceCentral(session, merged, catalog.revision, { database, legacyMergeBase: legacy });
					if (replaceResult === 'conflict') {
						continue;
					}
					if (replaceResult === 'sessionUnavailable') {
						return;
					}
					result = merged;
					return;
				}
				const local = await this.readLocalChatMetadata(central);
				if (JSON.stringify(local) !== JSON.stringify(central)) {
					const replaceResult = await this._replaceCentral(session, local, catalog.revision, { database });
					if (replaceResult === 'conflict') {
						continue;
					}
					if (replaceResult === 'sessionUnavailable') {
						return;
					}
				}
				result = local;
				return;
			}
		});
		return result;
	}

	private async _readCentral(session: URI, repairLegacyMirror: boolean): Promise<IPersistedPeerChat[] | undefined> {
		const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
		if (snapshot?.authorityVersion === 2) {
			return this._normalizedEntries(snapshot);
		}
		const catalog = await this._database.getSessionChatCatalog(session.toString());
		if (!catalog) {
			return undefined;
		}
		if (repairLegacyMirror && catalog.legacyMirroredRevision !== catalog.revision) {
			void this._enqueueLegacyMirror(session).catch(error => {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to repair legacy peer-chat membership for ${session.toString()}`);
			});
		}
		return this._readWorkingDirectories(this._entriesFromCatalog(catalog.chats));
	}

	/**
	 * Compatibility-only read used to import membership written by older builds.
	 * Missing or malformed data returns `undefined`; `[]` is an explicit empty sentinel.
	 */
	async tryReadLegacy(session: URI, batched = false, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[] | undefined> {
		return (await this._tryReadLegacyPayload(session, batched, database))?.entries;
	}

	private async _tryReadLegacyPayload(session: URI, batched = false, database?: AgentHostCatalogDatabaseReference): Promise<{ readonly raw: string; readonly entries: IPersistedPeerChat[] } | undefined> {
		if ((await this._database.readCatalogSnapshot([session.toString()]))[0]?.authorityVersion === 2) {
			return undefined;
		}
		const ref = database ?? await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const raw = batched
				? (await ref.object.getMetadataObject({ [PEER_CHATS_METADATA_KEY]: true }))[PEER_CHATS_METADATA_KEY]
				: await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
			if (raw === undefined) {
				return undefined;
			}
			return { raw, entries: this._parse(session, raw, IMPORTED_PEER_CHAT_LIMIT) };
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		} finally {
			if (!database) {
				ref.dispose();
			}
		}
	}

	async find(session: URI, chat: URI): Promise<IPersistedPeerChat | undefined> {
		const normalized = await this.readNormalizedChat(session, chat);
		if (normalized.normalized) {
			const row = normalized.chat;
			return row && {
				uri: row.chat, isRead: row.isRead, archived: row.archived,
				origin: row.origin === undefined ? undefined : this._parseOrigin(row.origin),
				inheritedTurnId: row.inheritedTurnId, workingDirectories: row.workingDirectories,
				...(await this._database.getChatV2ProviderDetail(row.chat)),
			};
		}
		const entries = await this.tryRead(session);
		return entries?.find(entry => entry.uri === chat.toString());
	}

	replace(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		return this._enqueueWrite(session, () => [...entries]);
	}

	async initialize(session: URI, entries: readonly IPersistedPeerChat[], database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[]> {
		await this.replaceForMigration(session, entries);
		const persisted = await this.reconcileLegacy(session, database);
		if (persisted === undefined) {
			throw new Error(`Cannot initialize peer-chat catalog for unavailable session ${session.toString()}`);
		}
		return persisted;
	}

	replaceForMigration(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		return this._enqueue(session, async () => {
			const sessionKey = session.toString();
			if (await this._database.getSessionChatCatalog(sessionKey)) {
				return;
			}
			const result = await this._database.replaceSessionChatCatalog(sessionKey, this._catalogRows(entries), undefined);
			if (result.status === 'applied') {
				await this._database.recordSessionChatCatalogLegacyMirrorPayload(sessionKey, result.revision, JSON.stringify(entries));
			}
		});
	}

	upsert(session: URI, chat: URI, providerData: string | undefined, origin?: ChatOrigin, inheritedTurnId?: string, workingDirectories?: readonly string[]): Promise<void> {
		const chatUri = chat.toString();
		const mutate = (entries: IPersistedPeerChat[]) => {
			const existing = entries.find(entry => entry.uri === chatUri);
			const effectiveOrigin = origin ?? existing?.origin;
			const effectiveInheritedTurnId = inheritedTurnId ?? existing?.inheritedTurnId;
			const effectiveWorkingDirectories = workingDirectories ?? existing?.workingDirectories;
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({
				uri: chatUri,
				...(existing?.isRead !== undefined ? { isRead: existing.isRead } : {}),
				...(existing?.archived ? { archived: true } : {}),
				...(providerData !== undefined ? { providerData } : {}),
				...(effectiveOrigin !== undefined ? { origin: effectiveOrigin } : {}),
				...(effectiveInheritedTurnId !== undefined ? { inheritedTurnId: effectiveInheritedTurnId } : {}),
				...(effectiveWorkingDirectories !== undefined ? { workingDirectories: [...effectiveWorkingDirectories] } : {}),
			});
			return next;
		};
		return this._trackMetadataWrite(async () => {
			const values = {
				[CHAT_PROVIDER_DATA_METADATA_KEY]: providerData ?? '',
				...(origin !== undefined ? { [CHAT_ORIGIN_METADATA_KEY]: JSON.stringify(origin) } : {}),
				...(inheritedTurnId !== undefined ? { [CHAT_INHERITED_TURN_METADATA_KEY]: inheritedTurnId } : {}),
				...(workingDirectories !== undefined ? { [CHAT_WORKING_DIRECTORIES_METADATA_KEY]: JSON.stringify(workingDirectories) } : {}),
			};
			if (this._metadataMigration && !Object.keys(await this._metadataMigration(session, chat, values)).length) {
				return;
			}
			await this._enqueue(session, async () => {
				const current = await this.readNormalizedChat(session, chat);
				if (current.normalized && current.chat) {
					await this._patchNormalized(session, chat, {
						providerData: providerData ?? null,
						...(origin !== undefined ? { origin: JSON.stringify(origin) } : {}),
						...(inheritedTurnId !== undefined ? { inheritedTurnId } : {}),
						...(workingDirectories !== undefined ? { workingDirectories } : {}),
					});
				} else {
					await this._applyWrite(session, mutate);
				}
			});
		});
	}

	updateWorkingDirectories(session: URI, chat: URI, workingDirectories: readonly string[]): Promise<void> {
		const chatUri = chat.toString();
		const mutate = (entries: IPersistedPeerChat[]) => {
			const existing = entries.find(entry => entry.uri === chatUri);
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({
				uri: chatUri,
				...(existing?.isRead !== undefined ? { isRead: existing.isRead } : {}),
				...(existing?.archived ? { archived: true } : {}),
				...(existing?.providerData !== undefined ? { providerData: existing.providerData } : {}),
				...(existing?.origin !== undefined ? { origin: existing.origin } : {}),
				...(existing?.inheritedTurnId !== undefined ? { inheritedTurnId: existing.inheritedTurnId } : {}),
				workingDirectories: [...workingDirectories],
			});
			return next;
		};
		return this._trackMetadataWrite(async () => {
			const values = { [CHAT_WORKING_DIRECTORIES_METADATA_KEY]: JSON.stringify(workingDirectories) };
			if (this._metadataMigration && !Object.keys(await this._metadataMigration(session, chat, values)).length) {
				return;
			}
			await this._enqueue(session, async () => {
				if (!await this._patchNormalized(session, chat, { workingDirectories })) {
					await this._applyWrite(session, mutate);
				}
			});
		});
	}

	setArchived(session: URI, chat: URI, archived: boolean): Promise<void> {
		return this._trackMetadataWrite(() => this._setArchived(session, chat, archived));
	}

	private async _setArchived(session: URI, chat: URI, archived: boolean): Promise<void> {
		const values = { [AH_META_IS_ARCHIVED_DB_KEY]: archived ? 'true' : '' };
		if (this._metadataMigration && !Object.keys(await this._metadataMigration(session, chat, values)).length) {
			return;
		}
		const chatUri = chat.toString();
		return this._enqueue(session, async () => {
			if (await this._patchNormalized(session, chat, { archived })) {
				return;
			}
			await this._applyWrite(session, entries => entries.map(entry =>
				entry.uri === chatUri
					? { ...entry, archived: archived || undefined }
					: entry));
		});
	}

	setRead(session: URI, chat: URI, isRead: boolean): Promise<void> {
		return this._trackMetadataWrite(() => this._setRead(session, chat, isRead));
	}

	private async _setRead(session: URI, chat: URI, isRead: boolean): Promise<void> {
		if (isDefaultChatUri(chat.toString())) {
			return this.persistMetadata(session, session, { [AH_META_DEFAULT_CHAT_IS_READ_DB_KEY]: isRead ? 'true' : '' });
		}
		const values = { [AH_META_IS_READ_DB_KEY]: isRead ? 'true' : '' };
		if (this._metadataMigration && !Object.keys(await this._metadataMigration(session, chat, values)).length) {
			return;
		}
		const chatUri = chat.toString();
		return this._enqueue(session, async () => {
			if (await this._patchNormalized(session, chat, { isRead })) {
				return;
			}
			await this._applyWrite(session, entries => entries.map(entry =>
				entry.uri === chatUri
					? { ...entry, isRead }
					: entry));
		});
	}

	private async _patchNormalized(session: URI, chat: URI, patch: IAgentHostDatabaseChatV2Patch): Promise<boolean> {
		while (true) {
			const current = await this.readNormalizedChat(session, chat);
			if (!current.normalized) {
				return false;
			}
			if (!current.chat) {
				throw new Error(`Missing normalized chat ${chat.toString()}`);
			}
			const result = await this._database.updateChatV2Metadata(chat.toString(), current.chat, patch);
			if (result.status === 'conflict') {
				continue;
			}
			if (result.status !== 'applied' && result.status !== 'replayed') {
				throw new Error(`Failed to update normalized chat ${chat.toString()}: ${result.status}`);
			}
			return true;
		}
	}

	remove(session: URI, chat: URI): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueue(session, async () => {
			while (true) {
				const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
				const row = snapshot?.chats.find(entry => entry.chat === chatUri);
				if (snapshot?.authorityVersion !== 2 || !row || row.order !== undefined) {
					return this._applyWrite(session, entries => entries.filter(entry => entry.uri !== chatUri));
				}
				if (!snapshot.header) {
					throw new Error(`Missing normalized catalog header for ${session.toString()}`);
				}
				const result = await this._database.removePrivateChatV2(session.toString(), chatUri, snapshot.header.revision);
				if (result.status === 'conflict') {
					continue;
				}
				if (result.status !== 'applied' && result.status !== 'replayed') {
					throw new Error(`Failed to remove private chat ${chatUri}: ${result.status}`);
				}
				return;
			}
		});
	}

	async beginSessionDeletion(session: URI): Promise<void> {
		const key = session.toString();
		this._deletingSessions.set(key, (this._deletingSessions.get(key) ?? 0) + 1);
		await this._writes.get(key)?.catch(() => { });
	}

	endSessionDeletion(session: URI): void {
		const key = session.toString();
		const count = this._deletingSessions.get(key);
		if (count === undefined || count <= 1) {
			this._deletingSessions.delete(key);
		} else {
			this._deletingSessions.set(key, count - 1);
		}
	}

	async readLocalChatMetadata(entries: readonly IPersistedPeerChat[]): Promise<IPersistedPeerChat[]> {
		const limiter = new Limiter<IPersistedPeerChat>(CHAT_METADATA_CONCURRENCY);
		return Promise.all(entries.map(entry => limiter.queue(async () => {
			try {
				return await this._readChatMetadata(entry);
			} catch (error) {
				this._logService.warn(`[AgentHostPeerChatStore] Failed to read chat-local metadata for ${entry.uri}: ${toErrorMessage(error)}`);
				return entry;
			}
		})));
	}

	private _enqueueWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		return this._enqueue(session, () => this._applyWrite(session, mutate));
	}

	private _enqueue(session: URI, operation: () => Promise<void>): Promise<void> {
		const key = session.toString();
		if (this._deletingSessions.has(key)) {
			return Promise.resolve();
		}
		const previous = this._writes.get(key) ?? Promise.resolve();
		const next = previous
			.catch(() => { /* a failed prior write must not block later ones */ })
			.then(operation);
		const clear = () => {
			if (this._writes.get(key) === tracked) {
				this._writes.delete(key);
			}
		};
		const tracked = next.then(clear, error => {
			clear();
			throw error;
		});
		this._writes.set(key, tracked);
		return tracked;
	}

	private async _applyWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		while (true) {
			const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
			if (snapshot?.authorityVersion === 2) {
				if (!snapshot.header) {
					throw new Error(`Missing normalized catalog header for ${session.toString()}`);
				}
				const updated = mutate(await this._normalizedEntries(snapshot));
				const result = await this._database.replaceSessionChatCatalog(session.toString(), this._catalogRows(updated), snapshot.header.revision);
				if (result.status === 'conflict') {
					const [current] = await this._database.readCatalogSnapshot([session.toString()]);
					if (current?.header?.revision === snapshot.header.revision) {
						throw new Error(`Normalized peer identity conflicts with the catalog for ${session.toString()}`);
					}
					continue;
				}
				if (result.status !== 'applied') {
					throw new Error(`Failed to update normalized peers for ${session.toString()}: ${result.status}`);
				}
				return;
			}
			let catalog = await this._database.getSessionChatCatalog(session.toString());
			let reconciledEntries: IPersistedPeerChat[] | undefined;
			if (catalog && catalog.legacyMirroredRevision !== catalog.revision) {
				const reconciled = await this._reconcileUnmirroredCatalog(session);
				if (reconciled.status === 'sessionUnavailable') {
					return;
				}
				if (reconciled.status === 'missingCatalog') {
					continue;
				}
				catalog = await this._database.getSessionChatCatalog(session.toString());
				if (!catalog || catalog.revision !== reconciled.revision) {
					continue;
				}
				reconciledEntries = reconciled.entries;
			}
			const central = catalog ? this._entriesFromCatalog(catalog.chats) : undefined;
			const legacyState = reconciledEntries ? undefined : await this._tryReadLegacyPayload(session);
			const legacy = legacyState?.entries;
			if (catalog && legacy !== undefined && catalog.legacyMirroredRevision === catalog.revision && catalog.legacyMirroredPayload === undefined) {
				if (!await this._database.markSessionChatCatalogLegacyMirrored(session.toString(), catalog.revision, JSON.stringify(legacy))) {
					continue;
				}
			}
			const legacyIsCurrentMirror = central !== undefined
				&& catalog?.legacyMirroredPayload !== undefined
				&& legacyState?.raw === catalog.legacyMirroredPayload
				&& catalog.legacyMirroredPayload === JSON.stringify(central);
			const base = catalog && legacy !== undefined && !legacyIsCurrentMirror
				? this._parseLegacyMirrorBase(session, catalog.legacyMirroredPayload)
				: undefined;
			const current = reconciledEntries
				?? (base && central && legacy ? this._mergeLegacyChanges(base, central, legacy) : undefined)
				?? (legacyIsCurrentMirror ? central : legacy)
				?? central
				?? [];
			const currentWithWorkingDirectories = await this._readWorkingDirectories(current);
			const updated = this._parse(session, JSON.stringify(mutate(currentWithWorkingDirectories)));
			const result = await this._replaceCentral(session, updated, catalog?.revision, {
				previousEntries: legacyIsCurrentMirror ? central : undefined,
				legacyMergeBase: legacy !== undefined && !legacyIsCurrentMirror ? legacy : undefined,
			});
			if (result !== 'conflict') {
				return;
			}
		}
	}

	private async _replaceCentral(session: URI, updated: readonly IPersistedPeerChat[], expectedRevision: number | undefined, options: IReplaceCentralOptions = {}): Promise<'applied' | 'conflict' | 'sessionUnavailable'> {
		const result = await this._database.replaceSessionChatCatalog(session.toString(), this._catalogRows(updated), expectedRevision);
		if (result.status !== 'applied') {
			if (result.status !== 'conflict') {
				this._logService.trace(`[AgentHostPeerChatStore] Ignoring chat catalog write for unavailable session ${session.toString()}: ${result.status}`);
			}
			return result.status === 'conflict' ? 'conflict' : 'sessionUnavailable';
		}
		if (options.legacyMergeBase && !await this._database.recordSessionChatCatalogLegacyMirrorPayload(session.toString(), result.revision, JSON.stringify(options.legacyMergeBase))) {
			return 'conflict';
		}
		if (options.publishCompatibility !== false) {
			try {
				await this._publishCompatibilityState(session, updated, result.revision, options.database, options.previousEntries);
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
			}
		}
		return 'applied';
	}

	private _catalogRows(entries: readonly IPersistedPeerChat[]): Array<{
		readonly chat: string;
		readonly order: number;
		readonly isRead?: boolean;
		readonly archived?: boolean;
		readonly providerData?: string;
		readonly origin?: string;
		readonly inheritedTurnId?: string;
		readonly workingDirectories?: readonly string[];
	}> {
		return entries.map((entry, order) => ({
			chat: entry.uri,
			order,
			...(entry.isRead !== undefined ? { isRead: entry.isRead } : {}),
			...(entry.archived === true ? { archived: true } : {}),
			...(entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
			...(entry.origin !== undefined ? { origin: this._stringifyOrigin(entry.origin) } : {}),
			...(entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
			...(entry.workingDirectories !== undefined ? { workingDirectories: entry.workingDirectories } : {}),
		}));
	}

	private async _publishCompatibilityState(session: URI, initialEntries: readonly IPersistedPeerChat[], initialRevision: number, database?: AgentHostCatalogDatabaseReference, initialPreviousEntries?: readonly IPersistedPeerChat[]): Promise<void> {
		if ((await this._database.readCatalogSnapshot([session.toString()]))[0]?.authorityVersion === 2) {
			return;
		}
		let entries = initialEntries;
		let revision = initialRevision;
		let previousEntries = initialPreviousEntries;
		while (true) {
			const limiter = new Limiter<void>(CHAT_METADATA_CONCURRENCY);
			const previousByUri = previousEntries && new Map(previousEntries.map(entry => [entry.uri, entry]));
			const changedEntries = previousByUri
				? entries.filter(entry => JSON.stringify(previousByUri.get(entry.uri)) !== JSON.stringify(entry))
				: entries;
			await Promise.all(changedEntries.map(entry => limiter.queue(() => this._writeChatMetadata(entry))));
			const current = await this._database.getSessionChatCatalog(session.toString());
			if (!current) {
				return;
			}
			if (current.revision !== revision) {
				previousEntries = entries;
				entries = await this._readWorkingDirectories(this._entriesFromCatalog(current.chats));
				revision = current.revision;
				continue;
			}
			if (await this._writeLegacyMirror(session, entries, revision, database)) {
				return;
			}
			const superseding = await this._database.getSessionChatCatalog(session.toString());
			if (!superseding) {
				return;
			}
			previousEntries = entries;
			entries = await this._readWorkingDirectories(this._entriesFromCatalog(superseding.chats));
			revision = superseding.revision;
		}
	}

	private _enqueueLegacyMirror(session: URI): Promise<void> {
		return this._enqueue(session, async () => {
			await this._reconcileUnmirroredCatalog(session);
		});
	}

	private async _reconcileUnmirroredCatalog(session: URI, database?: AgentHostCatalogDatabaseReference): Promise<
		| { readonly status: 'available'; readonly entries: IPersistedPeerChat[]; readonly revision: number }
		| { readonly status: 'missingCatalog' }
		| { readonly status: 'sessionUnavailable' }
	> {
		while (true) {
			const catalog = await this._database.getSessionChatCatalog(session.toString());
			if (!catalog) {
				return { status: 'missingCatalog' };
			}
			const central = this._entriesFromCatalog(catalog.chats);
			if (catalog.legacyMirroredRevision === catalog.revision) {
				return { status: 'available', entries: central, revision: catalog.revision };
			}
			const legacyPayload = database ? await this._tryReadLegacyPayload(session, true, database) : undefined;
			const legacyState = database
				? { databaseExists: true, ...legacyPayload, entries: legacyPayload?.entries }
				: await this._tryReadLegacyState(session);
			if (!legacyState.databaseExists) {
				return { status: 'available', entries: central, revision: catalog.revision };
			}
			const legacy = legacyState.entries;
			const base = this._parseLegacyMirrorBase(session, catalog.legacyMirroredPayload);
			if (legacy !== undefined && base !== undefined && legacyState.raw !== catalog.legacyMirroredPayload && JSON.stringify(legacy) !== JSON.stringify(base)) {
				const merged = this._mergeLegacyChanges(base, central, legacy);
				const replaceResult = await this._replaceCentral(session, merged, catalog.revision, { publishCompatibility: false, legacyMergeBase: legacy });
				if (replaceResult === 'conflict') {
					continue;
				}
				if (replaceResult === 'sessionUnavailable') {
					return { status: 'sessionUnavailable' };
				}
				const revision = catalog.revision + 1;
				try {
					await this._publishCompatibilityState(session, merged, revision, database);
				} catch (error) {
					this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
				}
				return { status: 'available', entries: merged, revision };
			}
			try {
				await this._publishCompatibilityState(session, central, catalog.revision, database);
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
			}
			return { status: 'available', entries: central, revision: catalog.revision };
		}
	}

	private async _writeLegacyMirror(session: URI, entries: readonly IPersistedPeerChat[], revision: number, database?: AgentHostCatalogDatabaseReference): Promise<boolean> {
		const payload = JSON.stringify(entries);
		const ref = database ?? this._sessionDataService.openDatabase(session);
		try {
			await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, payload);
		} finally {
			if (!database) {
				ref.dispose();
			}
		}
		return this._database.markSessionChatCatalogLegacyMirrored(session.toString(), revision, payload);
	}

	private async _tryReadLegacyState(session: URI): Promise<{ readonly databaseExists: boolean; readonly raw?: string; readonly entries: IPersistedPeerChat[] | undefined }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return { databaseExists: false, entries: undefined };
		}
		try {
			const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
			return {
				databaseExists: true,
				...(raw === undefined ? {} : { raw }),
				entries: raw === undefined ? undefined : this._parse(session, raw, IMPORTED_PEER_CHAT_LIMIT),
			};
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return { databaseExists: true, entries: undefined };
		} finally {
			ref.dispose();
		}
	}

	private _parseLegacyMirrorBase(session: URI, payload: string | undefined): IPersistedPeerChat[] | undefined {
		if (payload === undefined) {
			return undefined;
		}
		try {
			return this._parse(session, payload);
		} catch (error) {
			this._logService.warn(`[AgentHostPeerChatStore] Ignoring malformed legacy mirror base for ${session.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		}
	}

	private _mergeLegacyChanges(base: readonly IPersistedPeerChat[], central: readonly IPersistedPeerChat[], legacy: readonly IPersistedPeerChat[]): IPersistedPeerChat[] {
		const baseByUri = new Map(base.map(entry => [entry.uri, entry]));
		const centralByUri = new Map(central.map(entry => [entry.uri, entry]));
		const legacyUris = new Set(legacy.map(entry => entry.uri));
		const merged: IPersistedPeerChat[] = [];
		for (const legacyEntry of legacy) {
			const baseEntry = baseByUri.get(legacyEntry.uri);
			const centralEntry = centralByUri.get(legacyEntry.uri);
			if (!baseEntry || JSON.stringify(legacyEntry) !== JSON.stringify(baseEntry)) {
				merged.push(legacyEntry);
			} else if (centralEntry) {
				merged.push(centralEntry);
			}
		}
		for (const centralEntry of central) {
			if (!baseByUri.has(centralEntry.uri) && !legacyUris.has(centralEntry.uri)) {
				merged.push(centralEntry);
			}
		}
		return merged;
	}

	private async _readChatMetadata(entry: IPersistedPeerChat): Promise<IPersistedPeerChat> {
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(entry.uri));
		if (!ref) {
			return entry;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[AH_META_IS_READ_DB_KEY]: true,
				[CHAT_PROVIDER_DATA_METADATA_KEY]: true,
				[CHAT_ORIGIN_METADATA_KEY]: true,
				[CHAT_INHERITED_TURN_METADATA_KEY]: true,
				[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: true,
			});
			const isRead = metadata[AH_META_IS_READ_DB_KEY] !== undefined
				? metadata[AH_META_IS_READ_DB_KEY] === 'true'
				: entry.isRead;
			const origin = metadata[CHAT_ORIGIN_METADATA_KEY]
				? this._parseOrigin(metadata[CHAT_ORIGIN_METADATA_KEY])
				: metadata[CHAT_ORIGIN_METADATA_KEY] === '' ? undefined : entry.origin;
			const workingDirectories = metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY]
				? this._parseWorkingDirectories(metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY])
				: metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY] === '' ? undefined : entry.workingDirectories;
			return {
				uri: entry.uri,
				...(isRead !== undefined ? { isRead } : {}),
				...(metadata[CHAT_PROVIDER_DATA_METADATA_KEY] !== undefined
					? metadata[CHAT_PROVIDER_DATA_METADATA_KEY] ? { providerData: metadata[CHAT_PROVIDER_DATA_METADATA_KEY] } : {}
					: entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
				...(origin !== undefined ? { origin } : {}),
				...(metadata[CHAT_INHERITED_TURN_METADATA_KEY] !== undefined
					? metadata[CHAT_INHERITED_TURN_METADATA_KEY] ? { inheritedTurnId: metadata[CHAT_INHERITED_TURN_METADATA_KEY] } : {}
					: entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
				...(workingDirectories !== undefined ? { workingDirectories } : {}),
			};
		} finally {
			ref.dispose();
		}
	}

	private async _readWorkingDirectories(entries: readonly IPersistedPeerChat[]): Promise<IPersistedPeerChat[]> {
		const limiter = new Limiter<IPersistedPeerChat>(CHAT_METADATA_CONCURRENCY);
		return Promise.all(entries.map(entry => limiter.queue(async () => {
			const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(entry.uri));
			if (!ref) {
				return entry;
			}
			try {
				const raw = await ref.object.getMetadata(CHAT_WORKING_DIRECTORIES_METADATA_KEY);
				if (raw === undefined) {
					return entry;
				}
				const workingDirectories = raw ? this._parseWorkingDirectories(raw) : undefined;
				const { workingDirectories: _existingWorkingDirectories, ...entryWithoutWorkingDirectories } = entry;
				return {
					...entryWithoutWorkingDirectories,
					...(workingDirectories !== undefined ? { workingDirectories } : {}),
				};
			} catch (error) {
				this._logService.warn(`[AgentHostPeerChatStore] Failed to read chat working directories for ${entry.uri}: ${toErrorMessage(error)}`);
				return entry;
			} finally {
				ref.dispose();
			}
		})));
	}

	private async _writeChatMetadata(entry: IPersistedPeerChat): Promise<void> {
		const ref = this._sessionDataService.openDatabase(URI.parse(entry.uri));
		try {
			await ref.object.setMetadataValues({
				...(entry.isRead !== undefined ? { [AH_META_IS_READ_DB_KEY]: entry.isRead ? 'true' : '' } : {}),
				[CHAT_PROVIDER_DATA_METADATA_KEY]: entry.providerData ?? '',
				[CHAT_ORIGIN_METADATA_KEY]: entry.origin === undefined ? '' : this._stringifyOrigin(entry.origin),
				[CHAT_INHERITED_TURN_METADATA_KEY]: entry.inheritedTurnId ?? '',
				[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: entry.workingDirectories === undefined ? '' : JSON.stringify(entry.workingDirectories),
			});
		} finally {
			ref.dispose();
		}
	}

	private _parseOrigin(raw: string): ChatOrigin | undefined {
		const parsed: unknown = JSON.parse(raw);
		return fromCatalogChatOrigin(toSerializableJsonValue(parsed));
	}

	private _stringifyOrigin(origin: ChatOrigin): string {
		const value = toSerializableJsonValue(origin);
		if (value === undefined) {
			throw new Error('Chat origin is not JSON-serializable');
		}
		return JSON.stringify(value);
	}

	private _parseWorkingDirectories(raw: string): readonly string[] {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || !parsed.every(directory => typeof directory === 'string')) {
			throw new Error('expected an array of working-directory URIs');
		}
		return parsed;
	}

	private _entriesFromCatalog(chats: readonly {
		readonly chat: string;
		readonly isRead?: boolean;
		readonly providerData?: string;
		readonly origin?: string;
		readonly inheritedTurnId?: string;
		readonly archived?: boolean;
	}[]): IPersistedPeerChat[] {
		return chats.map(chat => ({
			uri: chat.chat,
			...(chat.isRead !== undefined ? { isRead: chat.isRead } : {}),
			...(chat.archived ? { archived: true } : {}),
			...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
			...(chat.origin !== undefined ? { origin: this._parseOrigin(chat.origin) } : {}),
			...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
		}));
	}

	private _parse(session: URI, raw: string, maximumEntries?: number): IPersistedPeerChat[] {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error('expected an array');
		}
		if (maximumEntries !== undefined && parsed.length > maximumEntries) {
			throw new Error(`legacy peer-chat catalog exceeds the ${maximumEntries} entry limit`);
		}
		const entryCount = parsed.length;
		const sessionKey = session.toString();
		const seen = new Set<string>();
		const result: IPersistedPeerChat[] = [];
		for (let index = 0; index < entryCount; index++) {
			const value = parsed[index];
			if (!isRecord(value) || typeof value.uri !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with no chat URI`);
				continue;
			}
			if (seen.has(value.uri)) {
				this._logService.warn(`[AgentService] Skipping duplicate peer-chat catalog entry ${index}`);
				continue;
			}
			let owner: string;
			try {
				owner = parseRequiredSessionUriFromChatUri(value.uri);
			} catch (error) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid chat URI: ${toErrorMessage(error)}`);
				continue;
			}
			if (owner !== sessionKey || isDefaultChatUri(value.uri)) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} that is not owned by ${sessionKey}`);
				continue;
			}
			if (value.providerData !== undefined && typeof value.providerData !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid provider data`);
				continue;
			}
			if (value.inheritedTurnId !== undefined && typeof value.inheritedTurnId !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid inherited turn id`);
				continue;
			}
			if (value.workingDirectories !== undefined && (!Array.isArray(value.workingDirectories) || !value.workingDirectories.every(directory => typeof directory === 'string'))) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid working directories`);
				continue;
			}
			if (value.archived !== undefined && typeof value.archived !== 'boolean') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid archived state`);
				continue;
			}
			if (value.isRead !== undefined && typeof value.isRead !== 'boolean') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid read state`);
				continue;
			}
			const originValue = toSerializableJsonValue(value.origin);
			const origin = fromCatalogChatOrigin(originValue);
			if (value.origin !== undefined && !origin) {
				this._logService.warn(`[AgentService] Dropping invalid origin from peer-chat catalog entry ${index}`);
			}
			seen.add(value.uri);
			result.push({
				uri: value.uri,
				...(typeof value.isRead === 'boolean' ? { isRead: value.isRead } : {}),
				...(value.archived === true ? { archived: true } : {}),
				...(typeof value.providerData === 'string' ? { providerData: value.providerData } : {}),
				...(origin ? { origin } : {}),
				...(typeof value.inheritedTurnId === 'string' ? { inheritedTurnId: value.inheritedTurnId } : {}),
				...(Array.isArray(value.workingDirectories) ? { workingDirectories: value.workingDirectories } : {}),
			});
		}
		return result;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
