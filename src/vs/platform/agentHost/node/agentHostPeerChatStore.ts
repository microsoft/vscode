/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Limiter, RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { equals as deepEquals } from '../../../base/common/objects.js';
import { isObject } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostSessionStateStore, SessionStateMirrorFlush, sessionStatePatch } from '../common/agentHostSessionStateStore.js';
import { ISessionDataService, type ISessionDatabase } from '../common/sessionDataService.js';
import type { AgentHostCatalogDatabaseReference } from './agentHostCatalogSyncService.js';
import { ChatInteractivity, ChatOrigin } from '../common/state/protocol/state.js';
import { AH_META_DEFAULT_CHAT_IS_READ_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY, isAhpChatChannel, type Message } from '../common/state/sessionState.js';
import { fromCatalogChatOrigin, toCatalogSummary, toSerializableJsonValue } from './agentHostCatalogSourceResolver.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT, agentHostCatalogChangesValidator } from './agentHostCatalogProjection.js';
import { IAgentHostDatabase, type IAgentHostDatabaseCatalogSnapshotEntry, type IAgentHostDatabaseChatV2, type IAgentHostDatabaseChatV2Patch, type IAgentHostDatabaseChatV2NormalizationChat, type IAgentHostDatabaseChatV2NormalizationCandidate, type IAgentHostDatabaseChatV2Mutation, type IAgentHostDatabaseOlderBuildChatListEdit, type IAgentHostDatabaseOlderBuildCopyPeer, type IAgentHostDatabaseOlderBuildCopySource } from './agentHostDatabase.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';
import { getChatChangesSummaryMetadataKey, META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { deriveLegacyDefaultChat } from '../common/agentHostLegacyDefaultChat.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';
import { legacyPeerChatStorage, mirrorsAtChatUri } from './agentHostStateManager.js';
import type { IAgentHostChatV2MetadataData } from './agentHostChatCatalogV2.js';

export const PEER_CHATS_METADATA_KEY = 'peerChats';
export const CHAT_PROVIDER_DATA_METADATA_KEY = 'agentHost.chatProviderData';
export const CHAT_ORIGIN_METADATA_KEY = 'agentHost.chatOrigin';
export const CHAT_INHERITED_TURN_METADATA_KEY = 'agentHost.chatInheritedTurnId';
export const CHAT_WORKING_DIRECTORIES_METADATA_KEY = 'agentHost.chatWorkingDirectories';
const CHAT_METADATA_CONCURRENCY = 4;

/** Records a peer's new working directories, encoded as older builds read them (`''` when cleared), when they differ from the previous ones. */
function addWorkingDirectoriesChange(changes: Map<string, string>, chat: string, previous: readonly string[] | undefined, next: readonly string[] | undefined): void {
	const encoded = next === undefined ? '' : JSON.stringify(next);
	if (encoded !== (previous === undefined ? '' : JSON.stringify(previous))) {
		changes.set(chat, encoded);
	}
}
const IMPORTED_PEER_CHAT_LIMIT = AGENT_HOST_CATALOG_CHILD_LIMIT - 1;

function isRecordObject(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

/**
 * How many of its writes (an import, a re-projection, an acknowledgement) an import or publish of a normalized
 * catalog's older-build copy lets another writer supersede before giving up; progress does not count. Past it,
 * the import reports `'superseded'` and writes nothing more.
 */
const OLDER_BUILD_COPY_ATTEMPT_LIMIT = 3;

/**
 * A listed peer's title as older builds read it, `''` when absent: `customChatTitle:<chat>` and
 * `customChatTitleSource:<chat>` in the session database, `customTitle` and `customTitleSource` in its own.
 */
interface IOlderBuildChatTitle {
	readonly title: string;
	readonly titleSource: string;
}

const NO_OLDER_BUILD_CHAT_TITLE: IOlderBuildChatTitle = { title: '', titleSource: '' };

function sameOlderBuildChatTitle(a: IOlderBuildChatTitle, b: IOlderBuildChatTitle): boolean {
	return a.title === b.title && a.titleSource === b.titleSource;
}

/**
 * The listed peers' titles this build gave older builds, recorded in two steps around writing them: `pending`
 * before (the titles about to be written), then `published` after, with `pending` cleared. Either is a title this
 * build had, so it is never taken for an older build's edit, also after a crash in between. `published` is
 * `undefined` until a first publish completed: before that, nothing is imported.
 */
interface IOlderBuildChatTitleRecord {
	readonly published: ReadonlyMap<string, IOlderBuildChatTitle> | undefined;
	readonly pending: ReadonlyMap<string, IOlderBuildChatTitle> | undefined;
	/** Chats that left the session's older-build list (moved to another session, or deleted), see {@link IOlderBuildLeftChat}. */
	readonly left: ReadonlyMap<string, IOlderBuildLeftChat>;
}

/**
 * What the session database of a session a chat left still holds for it, as this build last left it: older builds
 * keep routing the chat's renames and drafts there by its address (probe 4a, section 2). Its title as last published,
 * and its mirrored draft (the `chat_row_mirror` base, `null` for none).
 */
interface IOlderBuildLeftChat extends IOlderBuildChatTitle {
	readonly draft: string | null;
	/**
	 * An older build's draft this build is about to import for the chat, recorded before the import (the drafts'
	 * first step, as the titles' `pending`); cleared with the new base after it.
	 */
	readonly pendingDraft?: string | null;
}

/** Whether a chat's draft is the one serialized as `draft` (`null` for none). */
function sameDraft(draft: Message | undefined, serialized: string | null): boolean {
	return serialized === null ? draft === undefined : draft !== undefined && deepEquals(draft, JSON.parse(serialized));
}

function encodeOlderBuildChatTitleRecord(published: Readonly<Record<string, IOlderBuildChatTitle>> | undefined, pending: Readonly<Record<string, IOlderBuildChatTitle>> | undefined, left: Readonly<Record<string, IOlderBuildLeftChat>>): string {
	return JSON.stringify({ published: published ?? null, pending: pending ?? null, left });
}

/** `entry` in the key order and shape {@link AgentHostPeerChatStore} writes, omitting absent fields and `archived: false`. */
function canonicalPeerChat(entry: IPersistedPeerChat): IPersistedPeerChat {
	return {
		uri: entry.uri,
		...(entry.isRead !== undefined ? { isRead: entry.isRead } : {}),
		...(entry.archived ? { archived: true } : {}),
		...(entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
		...(entry.origin !== undefined ? { origin: entry.origin } : {}),
		...(entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
		...(entry.workingDirectories !== undefined ? { workingDirectories: [...entry.workingDirectories] } : {}),
	};
}

/**
 * What older builds read of a normalized catalog in its session database: the peer list and the listed peers' titles.
 * A chat whose title keys are both missing has no title here: no information, never a cleared title (1.140 to 1.142
 * never delete these keys; they clear a title by writing it empty), as after a lost or recreated session database.
 */
interface IOlderBuildSessionCopy {
	readonly peerChats: string | undefined;
	readonly titles: ReadonlyMap<string, IOlderBuildChatTitle>;
	/** The titles and drafts the session database holds for the chats that left it ({@link IOlderBuildChatTitleRecord.left}). */
	readonly left: ReadonlyMap<string, { readonly title: IOlderBuildChatTitle | undefined; readonly draft: string | null }>;
}

/** Whether older builds read `key` from a listed peer's own database, so the older-build copy writes it there. */
function isPeerKeyReadByOlderBuilds(_key: string): boolean {
	return true;
}

/** Whether a patch of a listed peer changes what its older-build copy holds: its entry or its title. Changes summaries do not. */
function changesOlderBuildCopy(chat: { readonly metadata?: IAgentHostChatV2MetadataData }, patch: IAgentHostDatabaseChatV2Patch): boolean {
	return patch.isRead !== undefined || patch.archived !== undefined || patch.providerData !== undefined
		|| patch.origin !== undefined || patch.inheritedTurnId !== undefined || patch.workingDirectories !== undefined
		|| patch.metadata !== undefined && (patch.metadata.summary !== chat.metadata?.summary || patch.metadata.titleSource !== chat.metadata?.titleSource);
}

/** Idle time after a normalized session's last change before its older-build copy is published. */
export const COMPATIBILITY_PUBLISH_IDLE_DELAY = 5000;
/** Longest a normalized session's older-build copy waits behind continuing changes. */
const COMPATIBILITY_PUBLISH_MAX_DELAY = 30000;

export const IAgentHostPeerChatPersistenceService = createDecorator<IAgentHostPeerChatPersistenceService>('agentHostPeerChatPersistenceService');

export interface IAgentHostPeerChatPersistenceService {
	readonly _serviceBrand: undefined;
	setRead(session: URI, chat: URI, isRead: boolean): Promise<void>;
	setArchived(session: URI, chat: URI, archived: boolean): Promise<void>;
	persistMetadata(session: URI, resource: URI, values: Readonly<Record<string, string>>): Promise<void>;
	persistDefaultChatTitleSnapshot(session: URI, chat: URI, title: string): Promise<void>;
	readNormalizedChat(session: URI, chat: URI): Promise<{ readonly normalized: boolean; readonly chat?: IAgentHostDatabaseChatV2 }>;
}

/** What an import of older-build edits changed in one chat, with the imported values; absent fields are unchanged. */
export interface IImportedOlderBuildChatEdit {
	/** The chat was added to the session's peers, or removed from them. */
	readonly membership?: 'added' | 'removed';
	readonly archived?: boolean;
	readonly isRead?: boolean;
	/** The imported title (`''` for none) and its source. */
	readonly title?: { readonly title: string; readonly titleSource: string | undefined };
	/** The imported draft (`null` for none). */
	readonly draft?: Message | null;
}

/** The chats of `session` an import of older-build edits changed in central state. */
export interface IOlderBuildEditsImport {
	readonly session: URI;
	readonly chats: ReadonlyMap<string, IImportedOlderBuildChatEdit>;
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

/** Runs before each publish of a session's older-build copy (Block 5). */
export interface IOlderBuildCopyParticipant {
	/**
	 * Prepares older-build state the session state store holds (a withheld worktree branch) for the publish of
	 * `session`'s older-build copy. Its failure is logged and never stops the publish.
	 */
	beforeOlderBuildCopyPublish(session: URI): Promise<void>;
}

export class AgentHostPeerChatStore implements IAgentHostPeerChatPersistenceService, IDisposable {

	declare readonly _serviceBrand: undefined;

	private readonly _writes = new Map<string, Promise<void>>();
	/** Metadata writes in flight, by session. */
	private readonly _metadataWrites = new Map<string, Set<Promise<void>>>();
	private readonly _deletingSessions = new Map<string, number>();
	/** Normalized catalogs whose older-build copy is published once their coalescing window ends, by session. */
	private readonly _pendingCompatibilityPublishes = new Map<string, { readonly session: URI; readonly scheduler: RunOnceScheduler; readonly firstChange: number }>();
	/** Normalized sessions whose older-build edits this process imported; older builds cannot write while it runs. */
	private readonly _olderBuildEditsImported = new Set<string>();
	private _metadataMigration: ((session: URI, resource: URI, values: Readonly<Record<string, string>>) => Promise<Readonly<Record<string, string>>>) | undefined;
	/** What the import running now changed, by session, announced when it ends. */
	private readonly _importedEdits = new Map<string, { readonly session: URI; readonly chats: Map<string, IImportedOlderBuildChatEdit> }>();
	private readonly _onDidImportOlderBuildEdits = new Emitter<IOlderBuildEditsImport>();
	/**
	 * Fires after an import of older-build edits changed chats in central state, so live state that already holds
	 * them follows; a session restored later reads them.
	 */
	readonly onDidImportOlderBuildEdits: Event<IOlderBuildEditsImport> = this._onDidImportOlderBuildEdits.event;

	constructor(
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
		private readonly _chatOwnership: IAgentHostChatOwnershipService,
		private readonly _sessionStateStore: IAgentHostSessionStateStore,
		private readonly _olderBuildCopyParticipant: IOlderBuildCopyParticipant,
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

	/**
	 * Awaits the writes of every session already in flight: for shutdown and tests only. A per-session path
	 * awaits its own sessions with {@link whenSessionsIdle}, never other sessions' writes (a background
	 * conversion pass keeps some in flight continuously). A pending older-build copy is not published: see
	 * {@link flushCompatibilityPublishes}.
	 */
	async whenIdle(): Promise<void> {
		while (this._writes.size || this._metadataWrites.size) {
			await Promise.all([...this._writes.values(), ...[...this._metadataWrites.values()].flatMap(writes => [...writes])]);
		}
	}

	/**
	 * Awaits the writes of `sessions` already in flight, and those they queue meanwhile; never another session's.
	 * A write touching two sessions (Block 4's moves and promotions, a saved-chat continuation) must pass BOTH, and
	 * guard BOTH with `guardOlderBuildEdits` (each session it re-projects).
	 */
	async whenSessionsIdle(sessions: readonly URI[]): Promise<void> {
		const keys = [...new Set(sessions.map(session => session.toString()))];
		while (true) {
			const pending = keys.flatMap(key => [...(this._writes.has(key) ? [this._writes.get(key)!] : []), ...this._metadataWrites.get(key) ?? []]);
			if (!pending.length) {
				return;
			}
			await Promise.allSettled(pending);
		}
	}

	/**
	 * Publishes the pending older-build copy of `session`, or of every session when `undefined`, now. Called only
	 * at shutdown, when a session is released (with its `database` still held), and before a move or promotion.
	 */
	async flushCompatibilityPublishes(session: URI | undefined, database: AgentHostCatalogDatabaseReference | undefined): Promise<void> {
		const keys = session ? [session.toString()] : [...this._pendingCompatibilityPublishes.keys()];
		await Promise.all(keys.map(key => this._flushCompatibilityPublish(key, database)));
	}

	/**
	 * A session is released (evicted while its `database` is still held): publishes its pending older-build copy, and
	 * re-checks for older-build edits on its next normalized write, as an older build may write meanwhile.
	 */
	async releaseSession(session: URI, database: AgentHostCatalogDatabaseReference): Promise<void> {
		this._olderBuildEditsImported.delete(session.toString());
		await this.flushCompatibilityPublishes(session, database);
	}

	dispose(): void {
		for (const { scheduler } of this._pendingCompatibilityPublishes.values()) {
			scheduler.dispose();
		}
		this._pendingCompatibilityPublishes.clear();
		this._onDidImportOlderBuildEdits.dispose();
	}

	private _noteImportedEdit(session: URI, chat: string, edit: IImportedOlderBuildChatEdit): void {
		if (!Object.keys(edit).length) {
			return;
		}
		const key = session.toString();
		let entry = this._importedEdits.get(key);
		if (!entry) {
			entry = { session, chats: new Map() };
			this._importedEdits.set(key, entry);
		}
		entry.chats.set(chat, { ...entry.chats.get(chat), ...edit });
	}

	private _announceImportedEdits(): void {
		const imports = [...this._importedEdits.values()];
		this._importedEdits.clear();
		for (const imported of imports) {
			this._onDidImportOlderBuildEdits.fire(imported);
		}
	}

	private _trackMetadataWrite(session: URI, operation: () => Promise<void>): Promise<void> {
		const key = session.toString();
		const tracked = operation().finally(() => {
			const writes = this._metadataWrites.get(key);
			writes?.delete(tracked);
			if (writes?.size === 0) {
				this._metadataWrites.delete(key);
			}
		});
		let writes = this._metadataWrites.get(key);
		if (!writes) {
			writes = new Set();
			this._metadataWrites.set(key, writes);
		}
		writes.add(tracked);
		return tracked;
	}

	persistPrivateChat(session: URI, chat: IAgentHostDatabaseChatV2NormalizationChat, restore = false, validate?: () => boolean): Promise<void> {
		return this._enqueue(session, async () => {
			while (true) {
				if (validate && !validate()) {
					return;
				}
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
					const chatRef = await this._sessionDataService.tryOpenDatabase(URI.parse(chat.storageResource ?? legacyPeerChatStorage(chat.chat)));
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
					}, validate)
					: await this._database.insertPrivateChatV2(session.toString(), { ...chat, metadata }, snapshot.header.revision, validate);
				if (result.status === 'cancelled') {
					return;
				}
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
		return this._trackMetadataWrite(session, () => this._persistMetadata(session, resource, values));
	}

	persistDefaultChatTitleSnapshot(session: URI, chat: URI, title: string): Promise<void> {
		return this._trackMetadataWrite(session, () => this._enqueue(session, async () => {
			while (true) {
				const current = await this.readNormalizedChat(session, chat);
				if (!current.normalized) {
					if (await this._database.isSessionTombstoned(session.toString())) {
						throw new Error(`Cannot snapshot a default title for deleted session ${session.toString()}`);
					}
					// Central state already holds the default chat's title.
					if ((await this._sessionStateStore.load(session)).chats.has(chat.toString())) {
						return;
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
				if (current.chat.order !== undefined) {
					this._scheduleCompatibilityPublish(session);
				}
				return;
			}
		}));
	}

	/**
	 * Writes the working directories of normalized peers whose directories changed into each peer's own
	 * database, the one thing of a normalized chat older builds read there: they overlay that key over the
	 * catalog on every read. Nothing else of a normalized chat is mirrored, so an operation that changes no
	 * peer's directories opens no database. Best effort: the normalized catalog stays the authority.
	 * @param changes the encoded new working directories (`''` when cleared), by peer chat URI.
	 */
	private async _mirrorPeerWorkingDirectories(session: URI, changes: ReadonlyMap<string, string>): Promise<void> {
		if (changes.size === 0) {
			return;
		}
		const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
		for (const [chat, workingDirectories] of changes) {
			// A catalog row without storage follows the creation-time rule. A chat nothing records any more has no
			// database to mirror into; never create one at its URI.
			const row = snapshot?.chats.find(candidate => candidate.chat === chat);
			const storage = this._chatOwnership.getChatStorageResource(chat) ?? row?.storageResource ?? (row ? this._chatOwnership.resolveChatStorageResource(session.toString(), chat) : undefined);
			if (storage === undefined || !mirrorsAtChatUri(chat, storage)) {
				continue;
			}
			try {
				const reference = this._sessionDataService.openDatabase(URI.parse(chat));
				try {
					await reference.object.setMetadata(CHAT_WORKING_DIRECTORIES_METADATA_KEY, workingDirectories);
				} finally {
					reference.dispose();
				}
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to mirror the working directories of ${chat} in ${session.toString()}`);
			}
		}
	}

	private async _persistMetadata(session: URI, resource: URI, values: Readonly<Record<string, string>>): Promise<void> {
		values = await this._metadataMigration?.(session, resource, values) ?? values;
		if (!Object.keys(values).length) {
			return;
		}
		return this._enqueue(session, async () => {
			await this._ensureOlderBuildEditsImported(session);
			let importedOlderBuildEdits = false;
			while (true) {
				const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
				if (snapshot?.authorityVersion !== 2) {
					await this._sessionStateStore.writeMetadata(session, resource, values, SessionStateMirrorFlush.Immediate);
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
					if (result.status === 'olderBuildEdits') {
						importedOlderBuildEdits = await this._importRefusedOlderBuildEdits(session, importedOlderBuildEdits);
					}
					if (result.status === 'conflict' || result.status === 'olderBuildEdits') {
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
					await this._sessionStateStore.writeMetadata(session, resource, legacy, SessionStateMirrorFlush.Immediate);
				}
				const changes = new Map<string, string>();
				for (const [chatUri, { chat, patch }] of patches) {
					if (patch.workingDirectories !== undefined && chat.order !== undefined && chatUri !== snapshot.header?.defaultChatUri) {
						addWorkingDirectoriesChange(changes, chatUri, chat.workingDirectories, patch.workingDirectories ?? undefined);
					}
				}
				await this._mirrorPeerWorkingDirectories(session, changes);
				if ([...patches].some(([chatUri, { chat, patch }]) => chat.order !== undefined && chatUri !== snapshot.header?.defaultChatUri && changesOlderBuildCopy(chat, patch))) {
					this._scheduleCompatibilityPublish(session);
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

	/** Imports membership changed by an older build, then returns central authority. */
	async reconcileLegacy(session: URI, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[] | undefined> {
		let result: IPersistedPeerChat[] | undefined;
		await this._enqueue(session, async () => {
			while (true) {
				const normalized = this._requireImported(session, await this._importOlderBuildEdits(session, database, database !== undefined));
				if (normalized !== 'notNormalized') {
					result = normalized;
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
				const local = await this.readLocalChatMetadata(session, central);
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

	/**
	 * A write outside this store changed `session`'s normalized chat list (Block 4's moves, promotions and reorders):
	 * publishes its older-build copy at the end of the coalescing window, as for a change made here, so older builds
	 * see the chats where they are now and the chats that left it are recorded as left.
	 */
	scheduleOlderBuildCopyPublish(session: URI): void {
		this._scheduleCompatibilityPublish(session);
	}

	/**
	 * Brings a normalized catalog's older-build copy in sync before a move or promotion validates, so it never works
	 * from a stale list: imports what older builds changed, then publishes the pending copy. Block 4 calls this.
	 */
	async reconcileOlderBuildCopy(session: URI): Promise<void> {
		await this._enqueue(session, async () => {
			this._requireImported(session, await this._importOlderBuildEdits(session, undefined, true));
		});
		await this.flushCompatibilityPublishes(session, undefined);
	}

	/**
	 * Imports, before the first normalized write of a session in this process, what older builds changed in its
	 * `session_chats`. One statement and no session database while this build's projection is current. The
	 * database refuses a write that would re-project over such edits anyway (`olderBuildEdits`); this keeps
	 * non-projecting writes in order with them too.
	 */
	private async _ensureOlderBuildEditsImported(session: URI): Promise<void> {
		const key = session.toString();
		if (this._olderBuildEditsImported.has(key)) {
			return;
		}
		// Superseded leaves the session unmarked: the database still refuses any write that would re-project over the edits.
		if ((await this._database.readOlderBuildCopyState(key))?.hasOlderBuildEdits && await this._importOlderBuildEdits(session, undefined, false) === 'superseded') {
			return;
		}
		this._olderBuildEditsImported.add(key);
	}

	/** Imports the older-build edits a guarded normalized write refused (`olderBuildEdits`), once per write. */
	private async _importRefusedOlderBuildEdits(session: URI, alreadyImported: boolean): Promise<true> {
		if (alreadyImported) {
			throw new Error(`Older-build chat edits of ${session.toString()} remain after importing them`);
		}
		this._requireImported(session, await this._importOlderBuildEdits(session, undefined, false));
		return true;
	}

	/** Maps an import another writer kept superseding to the caller's error path: it never writes past it. */
	private _requireImported<T>(session: URI, result: T | 'superseded'): T {
		if (result === 'superseded') {
			throw new Error(`Cannot import older-build chat edits of ${session.toString()}: its catalog kept changing`);
		}
		return result;
	}

	/**
	 * Imports what older builds changed in a normalized catalog's older-build copy. Returns the normalized peers,
	 * `'notNormalized'` for a legacy catalog, or `undefined` when the session is unavailable.
	 *
	 * `session_chats`: builds writing only the legacy stores (1.140, 1.141) rewrite it and advance `revision`, while
	 * this build keeps `projected_revision` equal to `revision` through every write of its own (in the same
	 * transaction). Only when they differ are the rows compared with the projection of the untouched `chats_v2`
	 * rows, the merge base; a difference then is an older build's committed write. No difference means the other
	 * writer kept the list: 1.142 writes it itself, and 1.141 re-mirrors it unchanged at quit with its renames only
	 * in the session database. The session database's copy is read then too, and the list is recorded as this
	 * build's projection again after it. A
	 * projection whose definition changed is never mistaken for an edit: the marker stays current, and the next
	 * write re-projects it. Rows naming chats `chats_v2` records but the projection does not list (private,
	 * deleted, the default, moved elsewhere) are never imported: older builds never saw them.
	 *
	 * `peerChats` (read when `readSessionCopy`, where the session database is held anyway, or when another writer
	 * advanced the revision; never for a catalog nothing else touched. The publisher
	 * checks it before overwriting it): a list other than the acknowledged one that is not this build's current
	 * projection was written by another build and is merged against the acknowledged payload. When it is this
	 * build's current projection, this build wrote it and stopped before acknowledging: it is just acknowledged.
	 *
	 * Both merge entry by entry like legacy reconciliation: added entries are kept, removals win, a changed entry
	 * wins whole (keeping its working directories, which the older list does not carry), otherwise the normalized
	 * entry stays. An import never transfers ownership, and publishes right away.
	 *
	 * Returns `'superseded'`, having logged it, when another writer moved the catalog on under
	 * {@link OLDER_BUILD_COPY_ATTEMPT_LIMIT} of its writes: nothing was imported from the last read.
	 *
	 * Listed peers' titles (read with `peerChats`, see {@link _importOlderBuildTitles}) merge the same way against
	 * the titles this build last published.
	 */
	private async _importOlderBuildEdits(session: URI, database: AgentHostCatalogDatabaseReference | undefined, readSessionCopy: boolean): Promise<IPersistedPeerChat[] | 'notNormalized' | 'superseded' | undefined> {
		try {
			return await this._importOlderBuildEditsNow(session, database, readSessionCopy);
		} finally {
			// Also what an attempt that ended in a conflict or an error wrote: it is committed.
			this._announceImportedEdits();
		}
	}

	private async _importOlderBuildEditsNow(session: URI, database: AgentHostCatalogDatabaseReference | undefined, readSessionCopy: boolean): Promise<IPersistedPeerChat[] | 'notNormalized' | 'superseded' | undefined> {
		const sessionKey = session.toString();
		let conflictedRevision: number | undefined;
		// Only reads another writer superseded count; a re-projection that went through is progress.
		let superseded = 0;
		while (true) {
			if (superseded === OLDER_BUILD_COPY_ATTEMPT_LIMIT) {
				this._logService.warn(`[AgentHostPeerChatStore] Gave up importing older-build chat edits of ${sessionKey}: its catalog kept changing`);
				return 'superseded';
			}
			const source = await this._database.readOlderBuildCopySource(sessionKey);
			if (!source) {
				return 'notNormalized';
			}
			let imported: 'imported' | 'unchanged' | 'conflict' = 'unchanged';
			if (source.hasOlderBuildEdits) {
				const edit = await this._database.readOlderBuildChatListEdit(sessionKey);
				imported = edit ? await this._importOlderBuildChatList(session, source, edit) : 'unchanged';
				if (imported === 'unchanged') {
					// Nothing to import: the projection is this build's again.
					if (!await this._database.reprojectOlderBuildChatList(sessionKey, source.revision)) {
						superseded++;
					}
					continue;
				}
			} else if ((readSessionCopy || source.projectionBehind) && (source.legacyMirroredPayload !== undefined || source.publishedChatState !== undefined)) {
				// Also when another build advanced the revision with the rows unchanged: 1.141 re-mirrors the list at quit,
				// and its renames are only in the session database. A catalog nothing touched opens no session database.
				imported = await this._importSessionCopyEdits(session, source, await this._readSessionCopy(session, database, source));
			}
			if (imported === 'conflict') {
				if (conflictedRevision === source.revision) {
					throw new Error(`Older-build chat edits conflict with normalized chat identities of ${sessionKey}`);
				}
				conflictedRevision = source.revision;
				superseded++;
				continue;
			}
			this._olderBuildEditsImported.add(sessionKey);
			const recordProjected = async () => {
				if (source.projectionBehind && !source.hasOlderBuildEdits) {
					// What else that build changed is imported: the unchanged list is this build's projection again.
					await this._database.recordOlderBuildChatListProjected(sessionKey);
				}
			};
			if (imported === 'imported') {
				// Recorded only once published: an interruption before it leaves the session copy to be read and published again.
				await this._publishNormalizedCompatibilityState(session, database);
				await recordProjected();
				const current = await this._database.readOlderBuildCopySource(sessionKey);
				return current ? this._normalizedEntriesFromSource(current) : undefined;
			}
			await recordProjected();
			if (!this._needsNoOlderBuildCopy(source) && (source.legacyMirroredPayload !== JSON.stringify(this._olderBuildCopyEntries(source.peers)) || this._hasUnpublishedTitles(session, source))) {
				this._scheduleCompatibilityPublish(session);
			}
			return this._normalizedEntriesFromSource(source);
		}
	}

	/** Whether the titles older builds read are not what this build last published, e.g. an import was interrupted before publishing. */
	private _hasUnpublishedTitles(session: URI, source: IAgentHostDatabaseOlderBuildCopySource): boolean {
		const entries = this._olderBuildCopyEntries(source.peers);
		const { left } = this._leftChats(session, source, this._parsePublishedChatTitles(session, source.publishedChatState), new Set(entries.map(entry => entry.uri)));
		return source.publishedChatState !== encodeOlderBuildChatTitleRecord(this._olderBuildChatTitles(source), undefined, left);
	}

	/** Imports an older build's `session_chats` rows (see {@link _importOlderBuildEdits}). */
	private async _importOlderBuildChatList(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, edit: IAgentHostDatabaseOlderBuildChatListEdit): Promise<'imported' | 'unchanged' | 'conflict'> {
		const knownUnlisted = new Set(edit.knownUnlisted);
		for (const chat of knownUnlisted) {
			this._logService.warn(`[AgentHostPeerChatStore] Not importing ${chat} into ${session.toString()}: its normalized record does not list it for older builds`);
		}
		const legacy = await this._withoutCentrallyOwnedElsewhere(session, this._entriesFromCatalog(edit.rows.filter(row => !knownUnlisted.has(row.chat))));
		const central = this._olderBuildCopyEntries(source.peers);
		// `session_chats` carries no working directories: the merge base and the older list compare without them.
		const base = central.map(({ workingDirectories: _workingDirectories, ...entry }) => entry);
		return this._writeImportedOlderBuildEdits(session, source, central, this._mergeOlderBuildChanges(base, central, legacy, this._movedIn(source)));
	}

	/** Imports another build's `peerChats` (see {@link _importOlderBuildEdits}). */
	private async _importSessionCopy(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, raw: string | undefined): Promise<'imported' | 'unchanged' | 'conflict'> {
		const central = this._olderBuildCopyEntries(source.peers);
		const copy = JSON.stringify(central);
		if (raw === undefined || raw === source.legacyMirroredPayload) {
			return 'unchanged';
		}
		if (raw === copy) {
			await this._database.markSessionChatCatalogLegacyMirrored(session.toString(), source.revision, copy);
			return 'unchanged';
		}
		const base = this._parseLegacyMirrorBase(session, source.legacyMirroredPayload);
		let legacy: IPersistedPeerChat[];
		try {
			legacy = await this._withoutCentrallyOwnedElsewhere(session, this._parse(session, raw, IMPORTED_PEER_CHAT_LIMIT));
		} catch (error) {
			this._logService.warn(`[AgentHostPeerChatStore] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return 'unchanged';
		}
		return base ? this._writeImportedOlderBuildEdits(session, source, central, this._mergeOlderBuildChanges(base, central, legacy, this._movedIn(source))) : 'unchanged';
	}

	private async _writeImportedOlderBuildEdits(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, central: readonly IPersistedPeerChat[], merged: readonly IPersistedPeerChat[]): Promise<'imported' | 'unchanged' | 'conflict'> {
		const directories = new Map(central.map(entry => [entry.uri, entry.workingDirectories]));
		const withDirectories = merged.map(entry => entry.workingDirectories === undefined && directories.get(entry.uri) !== undefined ? { ...entry, workingDirectories: directories.get(entry.uri) } : entry);
		if (JSON.stringify(withDirectories) === JSON.stringify(central)) {
			return 'unchanged';
		}
		this._logService.info(`[AgentHostPeerChatStore] Importing older-build chat edits into ${session.toString()}`);
		const result = await this._database.replaceSessionChatCatalogImportingOlderBuildEdits(session.toString(), this._catalogRows(withDirectories), source.revision);
		if (result.status !== 'applied') {
			return 'conflict';
		}
		const before = new Map(central.map(entry => [entry.uri, entry]));
		const after = new Map(withDirectories.map(entry => [entry.uri, entry]));
		for (const [chat, entry] of after) {
			const previous = before.get(chat);
			if (!previous) {
				this._noteImportedEdit(session, chat, { membership: 'added' });
				continue;
			}
			const archived = entry.archived === true;
			const isRead = entry.isRead !== false;
			this._noteImportedEdit(session, chat, {
				...(archived !== (previous.archived === true) ? { archived } : {}),
				...(isRead !== (previous.isRead !== false) ? { isRead } : {}),
			});
		}
		for (const chat of before.keys()) {
			if (!after.has(chat)) {
				this._noteImportedEdit(session, chat, { membership: 'removed' });
			}
		}
		return 'imported';
	}

	/** Imports what another build changed in the session database's copy: its peer list, then its titles. */
	private async _importSessionCopyEdits(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, copy: IOlderBuildSessionCopy | undefined): Promise<'imported' | 'unchanged' | 'conflict'> {
		const list = await this._importSessionCopy(session, source, copy?.peerChats);
		if (list === 'conflict' || !copy) {
			return list;
		}
		// The titles and left chats do not depend on the list: they import in the same visit even when the list changed
		// (a caller that imported a list does not read this copy again, so skipping them here lost them; live run L3).
		const titles = await this._importOlderBuildTitles(session, source, copy.titles);
		if (titles === 'conflict') {
			return titles;
		}
		const left = await this._importLeftChatEdits(session, source, copy.left);
		return list === 'imported' || titles === 'imported' ? 'imported' : left;
	}

	/**
	 * Imports the listed peers' titles another build changed since this build published them. A title other than
	 * the published one was written by an older build, which writes it to the session database and to the peer's
	 * own database (1.140, 1.141), and wins: the own database's where it differs from the published one, else the
	 * session database's. Nothing is imported before this build first published titles: without that merge base,
	 * a title cannot be told from one an older build left before this build took over.
	 */
	private async _importOlderBuildTitles(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, titles: ReadonlyMap<string, IOlderBuildChatTitle>): Promise<'imported' | 'unchanged' | 'conflict'> {
		const { published, pending } = this._parsePublishedChatTitles(session, source.publishedChatState);
		if (!published) {
			return 'unchanged';
		}
		let imported = false;
		for (const peer of source.peers) {
			// A title this build published or was publishing is its own, never an older build's edit.
			const isOwn = (title: IOlderBuildChatTitle) => sameOlderBuildChatTitle(title, published.get(peer.chat) ?? NO_OLDER_BUILD_CHAT_TITLE)
				|| pending !== undefined && sameOlderBuildChatTitle(title, pending.get(peer.chat) ?? NO_OLDER_BUILD_CHAT_TITLE);
			// Missing keys tell nothing: only a present title other than this build's can be an older build's edit. Missing
			// ones while this build gave the chat a title (a lost session database) leave only its own database to tell.
			let observed = titles.get(peer.chat);
			if (observed ? isOwn(observed) : isOwn(NO_OLDER_BUILD_CHAT_TITLE)) {
				continue;
			}
			if (mirrorsAtChatUri(peer.chat, peer.storageResource) && isPeerKeyReadByOlderBuilds(SESSION_CUSTOM_TITLE_KEY)) {
				// An own database without either key tells nothing (never "cleared"): the session database's title stands.
				const own = await this._readOwnOlderBuildTitle(peer.storageResource);
				if (own && !isOwn(own)) {
					observed = own;
				}
			}
			if (!observed || isOwn(observed)) {
				continue;
			}
			const applied = await this._applyOlderBuildTitle(session, peer.chat, observed);
			if (applied === 'conflict') {
				return 'conflict';
			}
			imported ||= applied === 'imported';
		}
		return imported ? 'imported' : 'unchanged';
	}

	/** Gives `chat` of `owner` the title an older build gave it, unless it already has it. */
	private async _applyOlderBuildTitle(owner: URI, chat: string, observed: IOlderBuildChatTitle): Promise<'imported' | 'unchanged' | 'conflict'> {
		const current = (await this._database.readChatV2(owner.toString(), chat)).chat;
		if (!current) {
			return 'conflict';
		}
		const { summary: _summary, titleSource: _titleSource, ...rest } = current.metadata ?? {};
		const summary = observed.title ? toCatalogSummary(observed.title) : undefined;
		const titleSource = summary !== undefined && (observed.titleSource === 'user' || observed.titleSource === 'agent' || observed.titleSource === 'auto') ? observed.titleSource : undefined;
		if (summary === current.metadata?.summary && titleSource === current.metadata?.titleSource) {
			return 'unchanged';
		}
		this._logService.info(`[AgentHostPeerChatStore] Importing an older build's title of ${chat} into ${owner.toString()}`);
		const result = await this._database.updateChatV2Metadata(chat, current, {
			metadata: { ...rest, ...(summary !== undefined ? { summary } : {}), ...(titleSource !== undefined ? { titleSource } : {}) },
		});
		if (result.status !== 'applied' && result.status !== 'replayed') {
			return 'conflict';
		}
		this._noteImportedEdit(owner, chat, { title: { title: summary ?? '', titleSource } });
		return 'imported';
	}

	/**
	 * Imports the renames and drafts older builds made, in this session's database, of chats that left it: older builds
	 * route a moved chat's per-chat edits to the session its address names (probe 4a, section 2). A title or draft
	 * other than the one this build last left there ({@link IOlderBuildLeftChat}) is an older build's edit, and goes
	 * to the chat under its current owner, as `chats_v2` records it (never the address, never this session). A chat
	 * deleted, or recorded under this session (moved back but not listed), takes nothing. Either way, what the
	 * session database holds becomes the new base, so nothing is imported twice.
	 */
	private async _importLeftChatEdits(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, observed: IOlderBuildSessionCopy['left']): Promise<'imported' | 'unchanged' | 'conflict'> {
		const record = this._parsePublishedChatTitles(session, source.publishedChatState);
		// Missing title keys tell nothing, as for listed peers.
		const retitled = (chat: string, base: IOlderBuildChatTitle) => {
			const title = observed.get(chat)?.title;
			return title !== undefined && !sameOlderBuildChatTitle(title, base) ? title : undefined;
		};
		const edited = [...record.left].filter(([chat, base]) => {
			const now = observed.get(chat);
			return now !== undefined && (retitled(chat, base) !== undefined || now.draft !== base.draft);
		});
		if (!edited.length) {
			return 'unchanged';
		}
		const owners = await this._database.findCentralChatOwners(edited.map(([chat]) => chat));
		const ownerOf = (chat: string): URI | undefined => {
			const owner = owners.get(chat);
			return owner?.source === 'normalized' && !owner.deleted && owner.ownerSession !== session.toString() ? URI.parse(owner.ownerSession) : undefined;
		};
		const left: Record<string, IOlderBuildLeftChat> = Object.fromEntries(record.left);
		const write = () => this._database.recordOlderBuildChatState(session.toString(), encodeOlderBuildChatTitleRecord(
			record.published && Object.fromEntries(record.published), record.pending && Object.fromEntries(record.pending), left));
		// First step for drafts, as the titles' `pending`: the drafts about to be imported are recorded before.
		const draftImports = edited.filter(([chat, base]) => ownerOf(chat) && observed.get(chat)!.draft !== base.draft);
		if (draftImports.length) {
			for (const [chat, base] of draftImports) {
				left[chat] = { ...base, pendingDraft: observed.get(chat)!.draft };
			}
			await write();
		}
		let conflict = false;
		for (const [chat, base] of edited) {
			const now = observed.get(chat)!;
			const title = retitled(chat, base);
			const ownerSession = ownerOf(chat);
			try {
				let titleBase: IOlderBuildChatTitle = title ?? base;
				if (!ownerSession) {
					this._logService.trace(`[AgentHostPeerChatStore] Not importing an older build's edit of ${chat}, which left ${session.toString()}: it has no other live owner`);
				} else {
					if (title) {
						const applied = await this._applyOlderBuildTitle(ownerSession, chat, title);
						if (applied === 'conflict') {
							// A lost write, or the chat moved or was deleted since its owner was read: the base stays, so it is retried.
							this._logService.trace(`[AgentHostPeerChatStore] Retrying an older build's title of ${chat} later: its owner's catalog changed`);
							titleBase = base;
							conflict = true;
						} else if (applied === 'imported') {
							this._scheduleCompatibilityPublish(ownerSession);
						}
					}
					if (now.draft !== base.draft) {
						// Three-way: only over the draft the chat had when it left (or had none); a newer one, this build's
						// own or the import itself before a crash, is kept.
						const current = await this._sessionStateStore.chatRows.getDraft(ownerSession, URI.parse(chat));
						if (sameDraft(current, base.draft)) {
							this._logService.info(`[AgentHostPeerChatStore] Importing an older build's draft of ${chat} into ${ownerSession.toString()}`);
							const draft = now.draft === null ? undefined : JSON.parse(now.draft) as Message;
							await this._sessionStateStore.chatRows.setDraft(ownerSession, URI.parse(chat), draft);
							this._noteImportedEdit(ownerSession, chat, { draft: draft ?? null });
						} else {
							this._logService.trace(`[AgentHostPeerChatStore] Not importing an older build's draft of ${chat}: ${sameDraft(current, now.draft) ? 'it is already imported' : 'it has a newer draft'}`);
						}
					}
				}
				left[chat] = { title: titleBase.title, titleSource: titleBase.titleSource, draft: now.draft };
			} catch (error) {
				// One chat's failure leaves its base (and pending draft) for the next visit, never the others' imports.
				this._logService.warn(`[AgentHostPeerChatStore] Failed to import an older build's edit of ${chat}, which left ${session.toString()}: ${toErrorMessage(error)}`);
			}
		}
		await write();
		return conflict ? 'conflict' : 'imported';
	}

	private async _readOwnOlderBuildTitle(storage: string): Promise<IOlderBuildChatTitle | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(storage));
		if (!ref) {
			return undefined;
		}
		try {
			const values = await ref.object.getMetadataObject({ [SESSION_CUSTOM_TITLE_KEY]: true, [SESSION_CUSTOM_TITLE_SOURCE_KEY]: true });
			if (values[SESSION_CUSTOM_TITLE_KEY] === undefined && values[SESSION_CUSTOM_TITLE_SOURCE_KEY] === undefined) {
				return undefined;
			}
			return { title: values[SESSION_CUSTOM_TITLE_KEY] ?? '', titleSource: values[SESSION_CUSTOM_TITLE_SOURCE_KEY] ?? '' };
		} finally {
			ref.dispose();
		}
	}

	/** Reads what older builds read of the session database in one statement: `peerChats` and, once titles were published, the listed peers' titles. */
	private async _readSessionCopy(session: URI, database: AgentHostCatalogDatabaseReference | undefined, source: IAgentHostDatabaseOlderBuildCopySource): Promise<IOlderBuildSessionCopy | undefined> {
		const ref = database ?? await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const peers = source.publishedChatState === undefined ? [] : source.peers.map(peer => peer.chat);
			const left = [...this._parsePublishedChatTitles(session, source.publishedChatState).left.keys()];
			const titleKeys = (chat: string) => [customChatTitleMetadataKey(chat), customChatTitleSourceMetadataKey(chat)];
			const keys = [PEER_CHATS_METADATA_KEY, ...peers.flatMap(titleKeys), ...left.flatMap(titleKeys)];
			const values: Record<string, string | undefined> = await ref.object.getMetadataObject(Object.fromEntries(keys.map(key => [key, true])));
			const title = (chat: string): IOlderBuildChatTitle | undefined => values[customChatTitleMetadataKey(chat)] === undefined && values[customChatTitleSourceMetadataKey(chat)] === undefined
				? undefined
				: { title: values[customChatTitleMetadataKey(chat)] ?? '', titleSource: values[customChatTitleSourceMetadataKey(chat)] ?? '' };
			// The drafts are read only for a session that chats left: one more read of its database then.
			const drafts = left.length ? (await ref.object.getRowsWatermark()).drafts : new Map<string, Message>();
			return {
				peerChats: values[PEER_CHATS_METADATA_KEY],
				titles: new Map(peers.flatMap(chat => {
					const value = title(chat);
					return value ? [[chat, value] as const] : [];
				})),
				left: new Map(left.map(chat => {
					const draft = drafts.get(chat);
					return [chat, { title: title(chat), draft: draft ? JSON.stringify(draft) : null }];
				})),
			};
		} finally {
			if (!database) {
				ref.dispose();
			}
		}
	}

	/** The listed peers' titles as published to older builds, by chat; an untitled peer is left out (its keys stay absent). */
	private _olderBuildChatTitles(source: IAgentHostDatabaseOlderBuildCopySource): Record<string, IOlderBuildChatTitle> {
		return Object.fromEntries(source.peers.flatMap(peer => peer.metadata?.summary === undefined ? [] : [[peer.chat, { title: peer.metadata.summary, titleSource: peer.metadata.titleSource ?? '' }]]));
	}

	/**
	 * Parses the record field by field, so that one written by an earlier build (without `left` or `pending`) keeps
	 * its other fields: a missing `left` is empty and a missing `pending` or `published` is `undefined`. Only a field
	 * of the wrong structure is dropped (logged); the record is ignored as a whole only when it is not a JSON object.
	 */
	private _parsePublishedChatTitles(session: URI, record: string | undefined): IOlderBuildChatTitleRecord {
		const empty: IOlderBuildChatTitleRecord = { published: undefined, pending: undefined, left: new Map() };
		if (record === undefined) {
			return empty;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(record);
		} catch (error) {
			this._logService.warn(`[AgentHostPeerChatStore] Ignoring the malformed published chat titles of ${session.toString()}: ${toErrorMessage(error)}`);
			return empty;
		}
		if (!isRecordObject(parsed)) {
			this._logService.warn(`[AgentHostPeerChatStore] Ignoring the malformed published chat titles of ${session.toString()}: not an object`);
			return empty;
		}
		const field = <T>(name: string, entry: (value: Record<string, unknown>) => T | undefined): ReadonlyMap<string, T> | undefined => {
			const value = parsed[name];
			if (value === undefined || value === null) {
				return undefined;
			}
			const entries = isRecordObject(value) ? Object.entries(value).map(([chat, candidate]) => [chat, isRecordObject(candidate) ? entry(candidate) : undefined] as const) : undefined;
			if (!entries || entries.some(([, parsedEntry]) => parsedEntry === undefined)) {
				this._logService.warn(`[AgentHostPeerChatStore] Dropping the malformed '${name}' of the published chat titles of ${session.toString()}`);
				return undefined;
			}
			return new Map(entries as [string, T][]);
		};
		const title = (value: Record<string, unknown>): IOlderBuildChatTitle | undefined => typeof value.title === 'string' && typeof value.titleSource === 'string'
			? { title: value.title, titleSource: value.titleSource }
			: undefined;
		return {
			published: field('published', title),
			pending: field('pending', title),
			left: field('left', (value): IOlderBuildLeftChat | undefined => {
				const base = title(value);
				const isDraft = (draft: unknown): draft is string | null => draft === null || typeof draft === 'string';
				return base && isDraft(value.draft) && (value.pendingDraft === undefined || isDraft(value.pendingDraft))
					? { ...base, draft: value.draft, ...(value.pendingDraft !== undefined ? { pendingDraft: value.pendingDraft } : {}) }
					: undefined;
			}) ?? new Map(),
		};
	}

	/**
	 * The chats leaving a session's older-build list in this publish (listed in its acknowledged copy or published
	 * titles but not in `listed`), whose per-chat keys the publish removes, and the chats that left it with what its
	 * session database then holds for them: those recorded before and still unlisted, plus those moved away now, whose
	 * title keys are removed (absent) and whose mirrored draft comes from the source read. A deleted chat leaves no
	 * entry: no build lists it anymore.
	 */
	private _leftChats(session: URI, source: IAgentHostDatabaseOlderBuildCopySource, record: IOlderBuildChatTitleRecord, listed: ReadonlySet<string>): { readonly leaving: readonly string[]; readonly left: Record<string, IOlderBuildLeftChat> } {
		const left: Record<string, IOlderBuildLeftChat> = Object.fromEntries([...record.left].filter(([chat]) => !listed.has(chat)));
		const deleted = new Set(source.deletedListed.map(entry => entry.chat));
		const previouslyListed = new Set([...record.published?.keys() ?? [], ...(this._parseLegacyMirrorBase(session, source.legacyMirroredPayload) ?? []).map(entry => entry.uri)]);
		const leaving = [...previouslyListed].filter(chat => !listed.has(chat));
		for (const chat of leaving) {
			if (deleted.has(chat)) {
				delete left[chat];
			} else if (left[chat] === undefined) {
				left[chat] = { ...NO_OLDER_BUILD_CHAT_TITLE, draft: source.unlistedDraftBases.find(entry => entry.chat === chat)?.base ?? null };
			}
		}
		return { leaving, left };
	}

	/**
	 * Removes the per-chat keys older builds read of chats leaving the list: their titles in the session database, and
	 * for a deleted chat, its own database's title keys if that database is left. A stale title must never read as an
	 * older build's rename of a chat that no longer is there. A moved chat's own database is its new owner's to publish.
	 */
	private async _removeLeavingChatKeys(source: IAgentHostDatabaseOlderBuildCopySource, leaving: readonly string[], sessionDatabase: ISessionDatabase): Promise<void> {
		if (!leaving.length) {
			return;
		}
		await sessionDatabase.deleteMetadata(leaving.flatMap(chat => [customChatTitleMetadataKey(chat), customChatTitleSourceMetadataKey(chat)]));
		const ownKeys = Object.keys(this._olderBuildOwnTitleKeys(NO_OLDER_BUILD_CHAT_TITLE));
		for (const { chat, storageResource } of source.deletedListed) {
			if (ownKeys.length && leaving.includes(chat) && mirrorsAtChatUri(chat, storageResource)) {
				const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(storageResource));
				try {
					await ref?.object.deleteMetadata(ownKeys);
				} finally {
					ref?.dispose();
				}
			}
		}
	}

	/** The title keys of a listed peer older builds read from its own database. */
	private _olderBuildOwnTitleKeys(title: IOlderBuildChatTitle): Record<string, string> {
		const values = { [SESSION_CUSTOM_TITLE_KEY]: title.title, [SESSION_CUSTOM_TITLE_SOURCE_KEY]: title.titleSource };
		return Object.fromEntries(Object.entries(values).filter(([key]) => isPeerKeyReadByOlderBuilds(key)));
	}

	/** The normalized peers as {@link _normalizedEntries} reads them, from an older-build copy source. */
	private _normalizedEntriesFromSource(source: IAgentHostDatabaseOlderBuildCopySource): IPersistedPeerChat[] {
		return source.peers.map(peer => ({
			uri: peer.chat,
			isRead: peer.isRead,
			archived: peer.archived ?? false,
			origin: peer.origin === undefined ? undefined : this._parseOrigin(peer.origin),
			inheritedTurnId: peer.inheritedTurnId,
			workingDirectories: peer.workingDirectories,
			...(peer.providerData !== undefined ? { providerData: peer.providerData } : {}),
		}));
	}

	/**
	 * Whether a normalized catalog needs no older-build copy: it lists no peer and none was ever published. Older
	 * builds that find no `peerChats` for a session with a catalog publish one from `session_chats` themselves.
	 */
	private _needsNoOlderBuildCopy(source: IAgentHostDatabaseOlderBuildCopySource): boolean {
		return source.legacyMirroredPayload === undefined && source.peers.length === 0;
	}

	/** The entries of a normalized catalog's older-build copy (`peerChats`): its projected peers in order. */
	private _olderBuildCopyEntries(peers: readonly IAgentHostDatabaseOlderBuildCopyPeer[]): IPersistedPeerChat[] {
		return this._entriesFromCatalog(peers);
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
		return this._readWorkingDirectories(session, this._entriesFromCatalog(catalog.chats));
	}

	/**
	 * Compatibility-only read used to import membership written by older builds.
	 * Missing or malformed data returns `undefined`; `[]` is an explicit empty sentinel.
	 */
	async tryReadLegacy(session: URI, batched = false, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[] | undefined> {
		return (await this._tryReadLegacyPayload(session, batched, database))?.entries;
	}

	private async _tryReadLegacyPayload(session: URI, batched = false, database?: AgentHostCatalogDatabaseReference): Promise<{ readonly raw: string; readonly entries: IPersistedPeerChat[] } | undefined> {
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
			return { raw, entries: await this._withoutCentrallyOwnedElsewhere(session, this._parse(session, raw, IMPORTED_PEER_CHAT_LIMIT)) };
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		} finally {
			if (!database) {
				ref.dispose();
			}
		}
	}

	/**
	 * A legacy entry belongs to the session whose database contains it, unless
	 * the live registry or the central catalog records the chat under another
	 * session or as deleted.
	 */
	private async _withoutCentrallyOwnedElsewhere(session: URI, entries: IPersistedPeerChat[]): Promise<IPersistedPeerChat[]> {
		const sessionKey = session.toString();
		const recorded = await this._database.findCentralChatOwners(entries.map(entry => entry.uri));
		const owned = entries.map(entry => {
			const liveOwner = this._chatOwnership.getChatOwner(entry.uri);
			if (liveOwner !== undefined) {
				return liveOwner === sessionKey;
			}
			const central = recorded.get(entry.uri);
			return !central || (central.ownerSession === sessionKey && !central.deleted);
		});
		return entries.filter((entry, index) => {
			if (!owned[index]) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${entry.uri} that is recorded outside ${sessionKey}`);
			}
			return owned[index];
		});
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
		return this._trackMetadataWrite(session, async () => {
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
		return this._trackMetadataWrite(session, async () => {
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
		return this._trackMetadataWrite(session, () => this._setArchived(session, chat, archived));
	}

	/** Archives saved metadata without migrating or materializing its provider backing. */
	archiveSavedChat(session: URI, chat: URI, validate: () => Promise<void>): Promise<void> {
		return this._trackMetadataWrite(session, () => this._enqueue(session, async () => {
			await validate();
			if (await this._patchNormalized(session, chat, { archived: true }, validate)) {
				return;
			}
			await validate();
			await this._applyWrite(session, entries => entries.map(entry => entry.uri === chat.toString() ? { ...entry, archived: true } : entry));
		}));
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
		return this._trackMetadataWrite(session, () => this._setRead(session, chat, isRead));
	}

	private async _setRead(session: URI, chat: URI, isRead: boolean): Promise<void> {
		if (this._chatOwnership.isDefaultChat(session.toString(), chat.toString())) {
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

	private async _patchNormalized(session: URI, chat: URI, patch: IAgentHostDatabaseChatV2Patch, validate?: () => Promise<void>): Promise<boolean> {
		await this._ensureOlderBuildEditsImported(session);
		let importedOlderBuildEdits = false;
		while (true) {
			const current = await this.readNormalizedChat(session, chat);
			if (!current.normalized) {
				return false;
			}
			if (!current.chat) {
				throw new Error(`Missing normalized chat ${chat.toString()}`);
			}
			await validate?.();
			const result = await this._database.updateChatV2Metadata(chat.toString(), current.chat, patch);
			if (result.status === 'olderBuildEdits') {
				importedOlderBuildEdits = await this._importRefusedOlderBuildEdits(session, importedOlderBuildEdits);
				continue;
			}
			if (result.status === 'conflict') {
				continue;
			}
			if (result.status !== 'applied' && result.status !== 'replayed') {
				throw new Error(`Failed to update normalized chat ${chat.toString()}: ${result.status}`);
			}
			const changes = new Map<string, string>();
			if (patch.workingDirectories !== undefined && current.chat.order !== undefined) {
				// Only a directories change reads the catalog header, to leave the default chat out.
				const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
				if (snapshot?.header?.defaultChatUri !== chat.toString()) {
					addWorkingDirectoriesChange(changes, chat.toString(), current.chat.workingDirectories, patch.workingDirectories ?? undefined);
				}
			}
			await this._mirrorPeerWorkingDirectories(session, changes);
			if (current.chat.order !== undefined && changesOlderBuildCopy(current.chat, patch)) {
				this._scheduleCompatibilityPublish(session);
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
		this._pendingCompatibilityPublishes.get(key)?.scheduler.dispose();
		this._pendingCompatibilityPublishes.delete(key);
		await this._writes.get(key)?.catch(() => { });
	}

	endSessionDeletion(session: URI): void {
		const key = session.toString();
		this._olderBuildEditsImported.delete(key);
		const count = this._deletingSessions.get(key);
		if (count === undefined || count <= 1) {
			this._deletingSessions.delete(key);
		} else {
			this._deletingSessions.set(key, count - 1);
		}
	}

	async readLocalChatMetadata(session: URI, entries: readonly IPersistedPeerChat[]): Promise<IPersistedPeerChat[]> {
		const limiter = new Limiter<IPersistedPeerChat>(CHAT_METADATA_CONCURRENCY);
		return Promise.all(entries.map(entry => limiter.queue(async () => {
			try {
				return await this._readChatMetadata(session, entry);
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
		await this._ensureOlderBuildEditsImported(session);
		let importedOlderBuildEdits = false;
		while (true) {
			const [snapshot] = await this._database.readCatalogSnapshot([session.toString()]);
			if (snapshot?.authorityVersion === 2) {
				if (!snapshot.header) {
					throw new Error(`Missing normalized catalog header for ${session.toString()}`);
				}
				const updated = mutate(await this._normalizedEntries(snapshot));
				const result = await this._database.replaceSessionChatCatalog(session.toString(), this._catalogRows(updated), snapshot.header.revision);
				if (result.status === 'olderBuildEdits') {
					importedOlderBuildEdits = await this._importRefusedOlderBuildEdits(session, importedOlderBuildEdits);
					continue;
				}
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
				const changes = new Map<string, string>();
				for (const entry of updated) {
					addWorkingDirectoriesChange(changes, entry.uri, snapshot.chats.find(previous => previous.chat === entry.uri)?.workingDirectories, entry.workingDirectories);
				}
				await this._mirrorPeerWorkingDirectories(session, changes);
				this._scheduleCompatibilityPublish(session);
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
			const currentWithWorkingDirectories = await this._readWorkingDirectories(session, current);
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
		if (result.status === 'olderBuildEdits') {
			// The caller re-reads and retries once the older build's edits are in.
			this._requireImported(session, await this._importOlderBuildEdits(session, options.database, false));
			return 'conflict';
		}
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
			return this._publishNormalizedCompatibilityState(session, database);
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
			await Promise.all(changedEntries.map(entry => limiter.queue(() => this._writeChatMetadata(session, entry))));
			await this._writeChatWorkingDirectories(session, changedEntries);
			const current = await this._database.getSessionChatCatalog(session.toString());
			if (!current) {
				return;
			}
			if (current.revision !== revision) {
				previousEntries = entries;
				entries = await this._readWorkingDirectories(session, this._entriesFromCatalog(current.chats));
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
			entries = await this._readWorkingDirectories(session, this._entriesFromCatalog(superseding.chats));
			revision = superseding.revision;
		}
	}

	private _enqueueLegacyMirror(session: URI): Promise<void> {
		return this._enqueue(session, async () => {
			await this._reconcileUnmirroredCatalog(session);
		});
	}

	/** Publishes a normalized catalog's older-build copy at the end of the session's coalescing window, once per burst of changes. */
	private _scheduleCompatibilityPublish(session: URI): void {
		const key = session.toString();
		const pending = this._pendingCompatibilityPublishes.get(key);
		if (pending) {
			// Each change restarts the idle window, up to the bound.
			if (Date.now() - pending.firstChange + COMPATIBILITY_PUBLISH_IDLE_DELAY <= COMPATIBILITY_PUBLISH_MAX_DELAY) {
				pending.scheduler.schedule();
			}
			return;
		}
		if (this._deletingSessions.has(key)) {
			return;
		}
		const scheduler = new RunOnceScheduler(() => void this._flushCompatibilityPublish(key, undefined), COMPATIBILITY_PUBLISH_IDLE_DELAY);
		this._pendingCompatibilityPublishes.set(key, { session, scheduler, firstChange: Date.now() });
		scheduler.schedule();
	}

	private _flushCompatibilityPublish(key: string, database: AgentHostCatalogDatabaseReference | undefined): Promise<void> {
		const pending = this._pendingCompatibilityPublishes.get(key);
		if (!pending) {
			return Promise.resolve();
		}
		pending.scheduler.dispose();
		this._pendingCompatibilityPublishes.delete(key);
		return this._trackMetadataWrite(pending.session, async () => {
			try {
				await this._olderBuildCopyParticipant.beforeOlderBuildCopyPublish(pending.session);
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to prepare the older-build copy of ${key}`);
			}
			await this._publishPendingCompatibilityState(pending.session, key, database);
		});
	}

	private _publishPendingCompatibilityState(session: URI, key: string, database: AgentHostCatalogDatabaseReference | undefined): Promise<void> {
		return this._enqueue(session, async () => {
			try {
				await this._publishNormalizedCompatibilityState(session, database);
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${key}`);
			}
		});
	}

	/**
	 * Publishes the older-build copy of a normalized catalog: the `peerChats` list and the listed peers' titles
	 * (`customChatTitle:<chat>`, `customChatTitleSource:<chat>`) in the session database, the keys older builds read
	 * in each listed peer's own database, and the acknowledgements (`legacy_mirrored_revision` and its payload, and
	 * the published titles: the merge bases of the next import).
	 *
	 * Invariant: the acknowledged payload is always exactly what `peerChats` holds. A newer revision with an older
	 * but matching pair is safe (older builds then republish from central), whereas an acknowledgement ahead of
	 * `peerChats` would make older builds take the stale list for their own edits. So the session database is
	 * written first and acknowledged after, outside any catalog write: one read transaction and one short
	 * acknowledgement transaction per publish, whose revision advances only if it is still current. Titles are
	 * recorded as pending before they are written and as published after (see {@link IOlderBuildChatTitleRecord}):
	 * a crash in between never lets a title this build wrote pass for an older build's edit.
	 *
	 * Private chats are never listed. A peer's keys are written only where they differ from the acknowledged
	 * payload or published titles, and only into the database at the peer's own URI, where older builds read them;
	 * a peer stored elsewhere gets no copy there. Before overwriting the session database's copy, what another build
	 * wrote there since it was published is imported.
	 */
	private async _publishNormalizedCompatibilityState(session: URI, database: AgentHostCatalogDatabaseReference | undefined): Promise<void> {
		const sessionKey = session.toString();
		let importedSessionCopy = false;
		let observedCopy: IOlderBuildSessionCopy | undefined;
		// Only acknowledgements another writer superseded count; importing the session copy first is progress.
		let superseded = 0;
		while (true) {
			if (superseded === OLDER_BUILD_COPY_ATTEMPT_LIMIT) {
				// The revision stays unacknowledged, so the next open or write publishes it.
				this._logService.warn(`[AgentHostPeerChatStore] Gave up publishing the older-build chat copy of ${sessionKey}: its catalog kept changing`);
				return;
			}
			const source = await this._database.readOlderBuildCopySource(sessionKey);
			if (!source || this._needsNoOlderBuildCopy(source)) {
				return;
			}
			if (source.hasOlderBuildEdits) {
				// Never overwrite an older build's `session_chats` edit: import it, which publishes.
				await this._importOlderBuildEdits(session, database, false);
				return;
			}
			const entries = this._olderBuildCopyEntries(source.peers);
			const payload = JSON.stringify(entries);
			const titles = this._olderBuildChatTitles(source);
			const { leaving, left } = this._leftChats(session, source, this._parsePublishedChatTitles(session, source.publishedChatState), new Set(entries.map(entry => entry.uri)));
			const titleRecord = encodeOlderBuildChatTitleRecord(titles, undefined, left);
			if (source.legacyMirroredPayload === payload && source.publishedChatState === titleRecord) {
				if (source.legacyMirroredRevision !== source.revision) {
					await this._database.markSessionChatCatalogLegacyMirrored(sessionKey, source.revision, payload);
				}
				return;
			}
			const ref = database ?? this._sessionDataService.openDatabase(session);
			try {
				if (!importedSessionCopy) {
					// Before overwriting the session database's copy, import what another build wrote there since it was published.
					observedCopy = await this._readSessionCopy(session, ref, source);
					const imported = await this._importSessionCopyEdits(session, source, observedCopy);
					if (imported !== 'unchanged') {
						importedSessionCopy = true;
						continue;
					}
				}
				const previous = new Map(this._parseLegacyMirrorBase(session, source.legacyMirroredPayload)?.map(entry => [entry.uri, this._olderBuildPeerKeys(entry)]));
				const previousTitles = this._parsePublishedChatTitles(session, source.publishedChatState);
				// A publish that stopped after recording its pending titles left the title keys unknown: all are rewritten.
				const interrupted = previousTitles.pending !== undefined;
				const publishedTitle = (chat: string) => previousTitles.published?.get(chat) ?? NO_OLDER_BUILD_CHAT_TITLE;
				// A peer titled before but no longer has its title cleared.
				const changedTitles = [...new Set([...Object.keys(titles), ...previousTitles.published?.keys() ?? [], ...previousTitles.pending?.keys() ?? []])]
					.map(chat => [chat, titles[chat] ?? NO_OLDER_BUILD_CHAT_TITLE] as const)
					.filter(([chat, title]) => entries.some(entry => entry.uri === chat) && (interrupted || !previousTitles.published || !sameOlderBuildChatTitle(title, publishedTitle(chat))
						// Keys missing from the session database (lost or recreated) are simply written again.
						|| titles[chat] !== undefined && observedCopy !== undefined && !observedCopy.titles.has(chat)));
				if (changedTitles.length) {
					// Recorded before the titles are written: a crash in between leaves them known as this build's own.
					await this._database.recordOlderBuildChatState(sessionKey, encodeOlderBuildChatTitleRecord(previousTitles.published && Object.fromEntries(previousTitles.published), titles, Object.fromEntries(previousTitles.left)));
				}
				const limiter = new Limiter<void>(CHAT_METADATA_CONCURRENCY);
				await Promise.all(entries.map((entry, index) => limiter.queue(async () => {
					if (!mirrorsAtChatUri(entry.uri, source.peers[index].storageResource)) {
						return;
					}
					const before = previous.get(entry.uri) ?? {};
					const titleBefore = this._olderBuildOwnTitleKeys(publishedTitle(entry.uri));
					const changed = [
						...Object.entries(this._olderBuildPeerKeys(entry)).filter(([key, value]) => value !== (before[key] ?? '')),
						...Object.entries(this._olderBuildOwnTitleKeys(titles[entry.uri] ?? NO_OLDER_BUILD_CHAT_TITLE)).filter(([key, value]) => interrupted || value !== (titleBefore[key] ?? '')),
					];
					if (changed.length) {
						const peerRef = this._sessionDataService.openDatabase(URI.parse(source.peers[index].storageResource));
						try {
							await peerRef.object.setMetadataValues(Object.fromEntries(changed));
						} finally {
							peerRef.dispose();
						}
					}
				})));
				if (changedTitles.length) {
					await ref.object.setMetadataValues(Object.fromEntries(changedTitles.flatMap(([chat, title]) => [
						[customChatTitleMetadataKey(chat), title.title],
						[customChatTitleSourceMetadataKey(chat), title.titleSource],
					])));
				}
				await this._removeLeavingChatKeys(source, leaving, ref.object);
				const acknowledged = source.legacyMirroredPayload !== payload
					? await this._writeLegacyMirror(session, entries, source.revision, ref)
					: source.legacyMirroredRevision === source.revision || await this._database.markSessionChatCatalogLegacyMirrored(sessionKey, source.revision, payload);
				if (source.publishedChatState !== titleRecord) {
					await this._database.recordOlderBuildChatState(sessionKey, titleRecord);
				}
				if (!acknowledged) {
					superseded++;
					// Another writer moved the catalog on after the read. The acknowledged payload still equals `peerChats`
					// (it is recorded either way), but the copy is behind: publish the newer revision now rather than
					// leaving it to a later write or open.
					continue;
				}
				return;
			} finally {
				if (!database) {
					ref.dispose();
				}
			}
		}
	}

	/** The keys of a listed peer older builds read from its own database, with the values its entry gives them. */
	private _olderBuildPeerKeys(entry: IPersistedPeerChat): Record<string, string> {
		const values: Record<string, string> = {
			...(entry.isRead !== undefined ? { [AH_META_IS_READ_DB_KEY]: entry.isRead ? 'true' : '' } : {}),
			[CHAT_PROVIDER_DATA_METADATA_KEY]: entry.providerData ?? '',
			[CHAT_ORIGIN_METADATA_KEY]: entry.origin === undefined ? '' : this._stringifyOrigin(entry.origin),
			[CHAT_INHERITED_TURN_METADATA_KEY]: entry.inheritedTurnId ?? '',
		};
		return Object.fromEntries(Object.entries(values).filter(([key]) => isPeerKeyReadByOlderBuilds(key)));
	}

	private async _reconcileUnmirroredCatalog(session: URI, database?: AgentHostCatalogDatabaseReference): Promise<
		| { readonly status: 'available'; readonly entries: IPersistedPeerChat[]; readonly revision: number }
		| { readonly status: 'missingCatalog' }
		| { readonly status: 'sessionUnavailable' }
	> {
		const normalized = this._requireImported(session, await this._importOlderBuildEdits(session, database, database !== undefined));
		if (normalized !== 'notNormalized') {
			const state = normalized && await this._database.readOlderBuildCopyState(session.toString());
			return normalized && state ? { status: 'available', entries: normalized, revision: state.revision } : { status: 'sessionUnavailable' };
		}
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
		// Intentional: the payload is acknowledged even when the revision moved on (false), as it is what `peerChats` now holds.
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

	/**
	 * {@link _mergeLegacyChanges} for a normalized catalog's older-build copy, without what older builds drop by merely
	 * opening a session (live run: 1.141 drops a peer's archived flag, 1.140 drops it and nulls `is_read`). Against
	 * the merge base, an older build's entry that lacks information it cannot express is no edit:
	 * - a missing read state, provider data, origin or inherited turn keeps the base's (no build clears them);
	 * - an archived chat stays archived: archive is sticky against older builds (a genuine unarchive made there does
	 *   not stick, as with deletes), while archiving a chat still imports;
	 * - an empty list of working directories keeps the base's (1.140 writes it empty);
	 * - the order stays the normalized one (no build can reorder chats): chats an older build added follow;
	 * - a chat moved in from another session (`movedIn`) is never removed: 1.141 drops it from the list it rewrites
	 *   (probe 4a, section 2), so its absence is no delete. A delete of a moved chat made in an older build does not
	 *   stick either (the accepted trade-off).
	 * Entries compare in one key order, so another build's JSON spelling is no edit either.
	 */
	private _mergeOlderBuildChanges(base: readonly IPersistedPeerChat[], central: readonly IPersistedPeerChat[], legacy: readonly IPersistedPeerChat[], movedIn: ReadonlySet<string>): IPersistedPeerChat[] {
		const baseByUri = new Map(base.map(entry => [entry.uri, entry]));
		const listed = new Set(legacy.map(entry => entry.uri));
		legacy = [...legacy, ...central.filter(entry => movedIn.has(entry.uri) && !listed.has(entry.uri))];
		const kept = legacy.map(entry => {
			const previous = baseByUri.get(entry.uri);
			return canonicalPeerChat(previous ? {
				...entry,
				isRead: entry.isRead ?? previous.isRead,
				archived: entry.archived || previous.archived,
				providerData: entry.providerData ?? previous.providerData,
				origin: entry.origin ?? previous.origin,
				inheritedTurnId: entry.inheritedTurnId ?? previous.inheritedTurnId,
				workingDirectories: entry.workingDirectories?.length ? entry.workingDirectories : previous.workingDirectories ?? entry.workingDirectories,
			} : entry);
		});
		const merged = this._mergeLegacyChanges(base.map(canonicalPeerChat), central, kept);
		const order = new Map(central.map((entry, index) => [entry.uri, index]));
		// A stable sort: chats the normalized catalog records keep its order, those an older build added follow in theirs.
		return merged.sort((a, b) => (order.get(a.uri) ?? central.length) - (order.get(b.uri) ?? central.length));
	}

	/** The chats of a normalized catalog's older-build copy moved in from another session. */
	private _movedIn(source: IAgentHostDatabaseOlderBuildCopySource): ReadonlySet<string> {
		return new Set(source.peers.filter(peer => peer.movedIn).map(peer => peer.chat));
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

	private async _readChatMetadata(session: URI, entry: IPersistedPeerChat): Promise<IPersistedPeerChat> {
		const central = this._sessionStateStore.peek(session)?.chats.get(entry.uri);
		// Legacy-catalog peers: their storage is their chat URI.
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(legacyPeerChatStorage(entry.uri)));
		if (!ref) {
			return entry;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[AH_META_IS_READ_DB_KEY]: true,
				[CHAT_PROVIDER_DATA_METADATA_KEY]: true,
				[CHAT_ORIGIN_METADATA_KEY]: true,
				[CHAT_INHERITED_TURN_METADATA_KEY]: true,
				...(central ? {} : { [CHAT_WORKING_DIRECTORIES_METADATA_KEY]: true }),
			});
			const isRead = metadata[AH_META_IS_READ_DB_KEY] !== undefined
				? metadata[AH_META_IS_READ_DB_KEY] === 'true'
				: entry.isRead;
			const origin = metadata[CHAT_ORIGIN_METADATA_KEY]
				? this._parseOrigin(metadata[CHAT_ORIGIN_METADATA_KEY])
				: metadata[CHAT_ORIGIN_METADATA_KEY] === '' ? undefined : entry.origin;
			const workingDirectories = central
				? central.workingDirectories ?? entry.workingDirectories
				: metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY]
					? this._parseWorkingDirectories(metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY])
					: metadata[CHAT_WORKING_DIRECTORIES_METADATA_KEY] === '' ? undefined : entry.workingDirectories;
			return {
				uri: entry.uri,
				...(entry.archived ? { archived: true } : {}),
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

	/** Takes each chat's working directories from the session state store, the only owner of `agentHost.chatWorkingDirectories`; unloaded sessions fall back to what the database holds. */
	private async _readWorkingDirectories(session: URI, entries: readonly IPersistedPeerChat[]): Promise<IPersistedPeerChat[]> {
		const central = this._sessionStateStore.peek(session)?.chats;
		const limiter = new Limiter<IPersistedPeerChat>(CHAT_METADATA_CONCURRENCY);
		return Promise.all(entries.map(entry => limiter.queue(async () => {
			const row = central?.get(entry.uri);
			if (row) {
				if (row.workingDirectories === undefined) {
					return entry;
				}
				const { workingDirectories: _existingWorkingDirectories, ...entryWithoutWorkingDirectories } = entry;
				return { ...entryWithoutWorkingDirectories, workingDirectories: [...row.workingDirectories] };
			}
			const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(legacyPeerChatStorage(entry.uri)));
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

	private async _writeChatMetadata(session: URI, entry: IPersistedPeerChat): Promise<void> {
		// A legacy-catalog peer: older builds read its metadata from its own database, at its chat URI.
		const ref = this._sessionDataService.openDatabase(URI.parse(legacyPeerChatStorage(entry.uri)));
		try {
			await ref.object.setMetadataValues(this._olderBuildPeerKeys(entry));
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Records the peers' working directories centrally in one write, only for the peers whose directories changed.
	 * The store's mirror flush is the only writer of the working directories key.
	 */
	private async _writeChatWorkingDirectories(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		if (entries.length === 0) {
			return;
		}
		await this._sessionStateStore.runExclusive(session, async exclusive => {
			const chats = entries
				.filter(entry => !equals(exclusive.snapshot.chats.get(entry.uri)?.workingDirectories ?? [], entry.workingDirectories ?? []) || !exclusive.snapshot.chats.has(entry.uri))
				.map(entry => ({ chat: entry.uri, isDefault: false, fields: { workingDirectories: entry.workingDirectories ?? null } }));
			if (chats.length > 0) {
				await exclusive.write(sessionStatePatch({ chats }), SessionStateMirrorFlush.Immediate);
			}
		});
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
		readonly workingDirectories?: readonly string[];
	}[]): IPersistedPeerChat[] {
		return chats.map(chat => ({
			uri: chat.chat,
			...(chat.isRead !== undefined ? { isRead: chat.isRead } : {}),
			...(chat.archived ? { archived: true } : {}),
			...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
			...(chat.origin !== undefined ? { origin: this._parseOrigin(chat.origin) } : {}),
			...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
			...(chat.workingDirectories !== undefined ? { workingDirectories: [...chat.workingDirectories] } : {}),
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
		// The legacy catalog lists only peers; it records no default chat of its own.
		const defaultChat = this._chatOwnership.getDefaultChat(sessionKey) ?? deriveLegacyDefaultChat(session);
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
			// The legacy catalog is stored per session, so its session owns every entry.
			if (!isAhpChatChannel(value.uri)) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid chat URI`);
				continue;
			}
			if (value.uri === defaultChat) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} that is the default chat of ${sessionKey}`);
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
