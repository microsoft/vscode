/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentHostChatRowStore, ISessionStateExclusive, ISessionStateKnownCatalog, ISessionStateSnapshot } from '../common/agentHostSessionStateStore.js';
import type { IPersistedTurnRecord, ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import type { Message } from '../common/state/sessionState.js';
import { creationTimeChatStorageResource } from './agentHostStateManager.js';
import type { IAgentHostDatabase } from './agentHostDatabase.js';

/** Progress recorded by `sessionStateRowsMoved:<session>` once the per-chat rows were copied. */
const ROWS_MOVED_PROGRESS = 'rows';

function defaultChatOf(snapshot: ISessionStateSnapshot): string | undefined {
	for (const [uri, entry] of snapshot.chats) {
		if (entry.isDefault) {
			return uri;
		}
	}
	return undefined;
}

/** The chat's storage and whether its rows are mirrored into the session database. */
function resolveStorage(session: URI, snapshot: ISessionStateSnapshot, chat: string): { readonly storage: URI; readonly mirrored: boolean } {
	const sessionKey = session.toString();
	const storage = snapshot.chats.get(chat)?.storage ?? creationTimeChatStorageResource(sessionKey, chat, defaultChatOf(snapshot));
	return { storage: URI.parse(storage), mirrored: storage !== sessionKey && hasSessionDatabase(sessionKey, snapshot) };
}

/**
 * Whether older builds read the session's rows from a database at the session URI: unless its default chat stores
 * elsewhere (a promoted chat, Block 4), which leaves the session without one (Q8a).
 */
function hasSessionDatabase(session: string, snapshot: ISessionStateSnapshot): boolean {
	const defaultStorage = [...snapshot.chats.values()].find(entry => entry.isDefault)?.storage;
	return defaultStorage === undefined || defaultStorage === session;
}

/** Returned by an operation addressed to a session a chat moved out of (Block 4), to run it in the chat's new owner. */
const movedChat = Symbol('movedChat');

/** The turn row watermark recorded with the moved marker (`rows@<max rowid>`). */
function parseWatermark(progress: string | undefined): number | undefined {
	const match = /^rows@(?<rowid>\d+)$/.exec(progress ?? '');
	return match?.groups ? Number(match.groups.rowid) : undefined;
}

/**
 * The config values a chat sets for itself, in its own database (the session
 * database for the default chat). The value records the chat it belongs to,
 * so a copy of another chat's database is never read as this chat's values.
 */
export const AH_CHAT_CONFIG_VALUES_DB_KEY = 'agentHost.chatConfigValues';

function parseChatConfigValues(raw: string | undefined, chat: string): Record<string, unknown> | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isObject(parsed) || parsed.chat !== chat || !isObject(parsed.values)) {
			return undefined;
		}
		return { ...parsed.values };
	} catch {
		return undefined;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function turnIdsBase(records: readonly IPersistedTurnRecord[]): string {
	return JSON.stringify(records.map(record => record.turnId).sort());
}

/**
 * Per-chat drafts and host-persisted turns. The chat's own database is
 * authoritative; rows of chats stored elsewhere are mirrored into the session
 * database (keyed by chat) for older builds, tracked by the rows revision and
 * the per-chat merge base so a crash between the two writes is repaired on load.
 */
export class AgentHostChatRowStore implements IAgentHostChatRowStore {

	constructor(
		private readonly _runExclusive: <T>(session: URI, task: (exclusive: ISessionStateExclusive) => Promise<T>) => Promise<T>,
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
		private readonly _isDeleted: (session: URI, chat: string) => boolean = () => false,
	) { }

	getDraft(session: URI, chat: URI): Promise<Message | undefined> {
		return this._read(session, chat, db => db.getChatDraft(chat), undefined);
	}

	async getPersistedTurns(session: URI, chat: URI, visibleTurnIds?: ReadonlySet<string>): Promise<Array<IPersistedTurnRecord & { seq: number }>> {
		return this._read(session, chat, async db => {
			const records = await db.getPersistedTurnsForChat(chat.toString());
			if (!visibleTurnIds) {
				return records;
			}
			return Promise.all(records.map(async record => {
				if (record.kind !== 'local' || record.anchorTurnId === undefined || visibleTurnIds.has(record.anchorTurnId)) {
					return record;
				}
				const eventId = await db.getTurnEventId(record.anchorTurnId);
				return eventId !== undefined && visibleTurnIds.has(eventId) ? { ...record, anchorTurnId: eventId } : record;
			}));
		}, []);
	}

	setDraft(session: URI, chat: URI, draft: Message | undefined): Promise<void> {
		return this._write(session, chat, 'draft', db => db.setChatDraft(chat, draft), async db => {
			const current = await db.getChatDraft(chat);
			return current ? JSON.stringify(current) : undefined;
		}, draft === undefined);
	}

	insertPersistedTurn(session: URI, record: IPersistedTurnRecord): Promise<void> {
		return this._write(session, URI.parse(record.chatUri), 'localTurns', db => db.insertPersistedTurn(record), turnsBase, false);
	}

	deletePersistedTurns(session: URI, chat: URI, turnIds: readonly string[]): Promise<void> {
		return this._write(session, chat, 'localTurns', db => db.deletePersistedTurns(turnIds), turnsBase, true);
	}

	getChatConfig(session: URI, chat: URI): Promise<Record<string, unknown> | undefined> {
		return this._read(session, chat, async db => parseChatConfigValues(await db.getMetadata(AH_CHAT_CONFIG_VALUES_DB_KEY), chat.toString()), undefined);
	}

	setChatConfig(session: URI, chat: URI, values: Readonly<Record<string, unknown>>): Promise<void> {
		return this._inCurrentOwner(session, chat, owningSession => this._setChatConfig(owningSession, chat, values), undefined);
	}

	private _setChatConfig(session: URI, chat: URI, values: Readonly<Record<string, unknown>>): Promise<undefined | typeof movedChat> {
		return this._runExclusive(session, async exclusive => {
			const owner = await this._owner(session, exclusive.snapshot, chat.toString());
			if (!owner && await this._movedFrom(session, chat)) {
				return movedChat;
			}
			if (!owner && this._isDeleted(session, chat.toString())) {
				this._logService.trace(`[AgentHostChatRowStore] Dropping a late config write of deleted chat ${chat.toString()}`);
				return undefined;
			}
			// A chat not recorded yet (one being created) follows the creation-time rule.
			const { storage } = owner ?? resolveStorage(session, exclusive.snapshot, chat.toString());
			const ref = this._sessionDataService.openDatabase(storage);
			try {
				await ref.object.setMetadata(AH_CHAT_CONFIG_VALUES_DB_KEY, JSON.stringify({ chat: chat.toString(), values }));
			} finally {
				ref.dispose();
			}
			return undefined;
		});
	}

	storageOf(session: URI, chat: URI): Promise<{ readonly storage: URI; readonly isDefault: boolean } | undefined> {
		return this._runExclusive(session, async exclusive => {
			const owner = await this._owner(session, exclusive.snapshot, chat.toString());
			return owner && { storage: owner.storage, isDefault: owner.isDefault };
		});
	}

	/**
	 * The storage of a chat the session records and whether it is the recorded default chat: from
	 * the session's central state, else from its chat catalog (a peer added after the import).
	 * `undefined` for a chat neither records: one not registered yet, or one deleted.
	 */
	private async _owner(session: URI, snapshot: ISessionStateSnapshot, chat: string): Promise<{ readonly storage: URI; readonly mirrored: boolean; readonly isDefault: boolean } | undefined> {
		const entry = snapshot.chats.get(chat);
		if (entry && (entry.isDefault || entry.storage !== undefined)) {
			return { ...resolveStorage(session, snapshot, chat), isDefault: entry.isDefault };
		}
		const normalized = await this._database.readChatV2(session.toString(), chat);
		if (entry) {
			// A peer central state learned after its import (one this build created) records no storage: its catalog does.
			const recorded = normalized.chat?.storageResource ?? creationTimeChatStorageResource(session.toString(), chat, defaultChatOf(snapshot));
			return { storage: URI.parse(recorded), mirrored: recorded !== session.toString() && hasSessionDatabase(session.toString(), snapshot), isDefault: false };
		}
		const recorded = normalized.normalized
			? normalized.chat && (normalized.chat.storageResource ?? chat)
			: (await this._database.getSessionChatCatalog(session.toString()))?.chats.some(row => row.chat === chat) ? chat : undefined;
		return recorded === undefined ? undefined : { storage: URI.parse(recorded), mirrored: recorded !== session.toString() && hasSessionDatabase(session.toString(), snapshot), isDefault: false };
	}

	/**
	 * Runs `task` for `chat` in `session`, or once more in the chat's current owner when the chat moved out of
	 * `session` (Block 4) before the task ran: a read or write addressed to its previous owner follows it there.
	 */
	private async _inCurrentOwner<T>(session: URI, chat: URI, task: (session: URI) => Promise<T | typeof movedChat>, gone: T): Promise<T> {
		const result = await task(session);
		if (result !== movedChat) {
			return result;
		}
		const owner = (await this._database.findCentralChatOwners([chat.toString()])).get(chat.toString())?.ownerSession;
		if (owner === undefined) {
			this._logService.trace(`[AgentHostChatRowStore] Dropping a row access of chat ${chat.toString()}: it was deleted while it was accessed`);
			return gone;
		}
		const retried = await task(URI.parse(owner));
		if (retried === movedChat) {
			throw new Error(`Chat ${chat.toString()} moved again while its rows were accessed`);
		}
		return retried;
	}

	/** Whether `chat`, which `session` does not record, now belongs to another session. */
	private async _movedFrom(session: URI, chat: URI): Promise<boolean> {
		if (!await this._database.hasMovedChatsV2()) {
			// No chat ever moved: none moved out of `session`.
			return false;
		}
		const owner = (await this._database.findCentralChatOwners([chat.toString()])).get(chat.toString())?.ownerSession;
		return owner !== undefined && owner !== session.toString();
	}

	private _read<T>(session: URI, chat: URI, read: (db: ISessionDatabase) => Promise<T>, fallback: T): Promise<T> {
		return this._inCurrentOwner(session, chat, owningSession => this._readIn(owningSession, chat, read, fallback), fallback);
	}

	private _readIn<T>(session: URI, chat: URI, read: (db: ISessionDatabase) => Promise<T>, fallback: T): Promise<T | typeof movedChat> {
		return this._runExclusive(session, async exclusive => {
			const owner = await this._owner(session, exclusive.snapshot, chat.toString());
			if (!owner && await this._movedFrom(session, chat)) {
				return movedChat;
			}
			// A chat the session does not record has no authoritative storage; its rows, if any, are in the session database.
			const storage = owner?.storage ?? session;
			const ref = await this._sessionDataService.tryOpenDatabase(storage);
			if (!ref) {
				return fallback;
			}
			try {
				return await read(ref.object);
			} finally {
				ref.dispose();
			}
		});
	}

	private _write(session: URI, chat: URI, kind: 'draft' | 'localTurns', apply: (db: ISessionDatabase) => Promise<void>, base: (db: ISessionDatabase, chat: string) => Promise<string | undefined>, removal: boolean): Promise<void> {
		return this._inCurrentOwner(session, chat, owningSession => this._writeIn(owningSession, chat, kind, apply, base, removal), undefined);
	}

	private _writeIn(session: URI, chat: URI, kind: 'draft' | 'localTurns', apply: (db: ISessionDatabase) => Promise<void>, base: (db: ISessionDatabase, chat: string) => Promise<string | undefined>, removal: boolean): Promise<undefined | typeof movedChat> {
		return this._runExclusive(session, async exclusive => {
			const owner = await this._owner(session, exclusive.snapshot, chat.toString());
			if (!owner && await this._movedFrom(session, chat)) {
				// Its new owner records it and mirrors it, if anyone does; this session never gets its rows again.
				return movedChat;
			}
			if (!removal && !owner && this._isDeleted(session, chat.toString())) {
				// A late write of a chat that was deleted (or whose session is being deleted) never recreates its storage.
				this._logService.trace(`[AgentHostChatRowStore] Dropping a late ${kind} write of deleted chat ${chat.toString()}`);
				return undefined;
			}
			// A chat not recorded yet (a fork copying its rows before it is registered) follows the creation-time rule.
			const { storage, mirrored } = owner ?? resolveStorage(session, exclusive.snapshot, chat.toString());
			let revision: number | undefined;
			if (mirrored) {
				// Recorded before either write: a crash in between only costs a repair on the next load.
				const bumped = await this._database.bumpSessionStateRowsRevision(session.toString());
				revision = bumped.status === 'applied' ? bumped.revision : undefined;
			}
			const ownRef = removal ? await this._sessionDataService.tryOpenDatabase(storage) : this._sessionDataService.openDatabase(storage);
			if (ownRef) {
				try {
					await apply(ownRef.object);
					if (mirrored) {
						const mirrorBase = await base(ownRef.object, chat.toString());
						await this._mirror(session, chat, kind, apply, mirrorBase, revision, removal);
					}
				} finally {
					ownRef.dispose();
				}
			} else if (mirrored) {
				// The chat's own database was never created, so its rows, if any, are only in the session database.
				await this._mirror(session, chat, kind, apply, kind === 'draft' ? undefined : turnIdsBase([]), revision, removal);
			}
			return undefined;
		});
	}

	private async _mirror(session: URI, chat: URI, kind: 'draft' | 'localTurns', apply: (db: ISessionDatabase) => Promise<void>, base: string | undefined, revision: number | undefined, rethrow: boolean): Promise<void> {
		try {
			const sessionRef = this._sessionDataService.openDatabase(session);
			try {
				await apply(sessionRef.object);
			} finally {
				sessionRef.dispose();
			}
			await this._database.writeChatRowMirror(session.toString(), chat.toString(), kind, base);
			if (revision !== undefined) {
				await this._database.markSessionStateRowsMirrored(session.toString(), revision);
			}
		} catch (error) {
			this._logService.warn(`[AgentHostChatRowStore] Failed to mirror ${kind} rows of ${chat.toString()}; repaired on the next load`, error);
			if (rethrow) {
				// A removal that could not reach the session database must not look complete: the caller cleans up the chat afterwards.
				throw error;
			}
		}
	}

	/**
	 * Runs once per session after its central state is loaded (the caller holds
	 * the session's exclusive section): copies the rows of every chat stored
	 * outside the session database into its own database — originals stay for
	 * older builds — and repairs mirrors a crash left stale.
	 * @param draftMirrorBases each chat's mirrored draft as this build last left it: a peer's draft in the session
	 * database that differs was edited by an older build (1.140 and 1.141 write a peer's draft there alone).
	 */
	async moveRows(session: URI, snapshot: ISessionStateSnapshot, catalog: ISessionStateKnownCatalog | undefined, progress: string | undefined, rowsRevision: number, rowsMirroredRevision: number, mirrorEdited: boolean, draftMirrorBases: ReadonlyMap<string, string>): Promise<void> {
		const sessionKey = session.toString();
		const peers = await this._peers(session, snapshot, catalog);
		const moved = progress?.startsWith(ROWS_MOVED_PROGRESS) ?? false;
		const watermark = parseWatermark(progress);
		if (moved && rowsRevision === rowsMirroredRevision && (peers.length === 0 || !mirrorEdited && watermark !== undefined && await this._isMirrorUnedited(session, peers, draftMirrorBases, watermark))) {
			return;
		}
		const sessionRef = await this._sessionDataService.tryOpenDatabase(session);
		if (!sessionRef) {
			await this._database.markSessionStateRowsMoved(sessionKey, ROWS_MOVED_PROGRESS);
			return;
		}
		let maxRowid = 0;
		try {
			const rows = await sessionRef.object.getRowsWatermark();
			maxRowid = rows.maxTurnRowid;
			// An old build writing after a downgrade is only visible as an edited mirror entry, as turn rows above the watermark or as an edited peer draft.
			const importEdits = moved && (mirrorEdited || watermark === undefined || maxRowid > watermark || hasEditedDraft(rows.drafts, peers, draftMirrorBases));
			for (const [chat, storage] of peers) {
				const lagging = rowsRevision > rowsMirroredRevision;
				const hasRows = await this._hasRows(sessionRef.object, chat);
				if (!lagging && !importEdits && !hasRows) {
					continue;
				}
				// Only rows to take in create the chat's own database; otherwise there is nothing of the chat to move or repair.
				const ownRef = hasRows ? this._sessionDataService.openDatabase(URI.parse(storage)) : await this._sessionDataService.tryOpenDatabase(URI.parse(storage));
				if (!ownRef) {
					continue;
				}
				try {
					if (!moved) {
						await this._copyRows(sessionRef.object, ownRef.object, chat);
					} else if (importEdits) {
						await this._importEdits(sessionRef.object, ownRef.object, sessionKey, chat);
					}
					await this._repairMirror(sessionRef.object, ownRef.object, sessionKey, chat);
				} finally {
					ownRef.dispose();
				}
			}
			await this._moveCheckpoints(sessionRef.object, snapshot, peers);
		} finally {
			sessionRef.dispose();
		}
		if (rowsRevision > rowsMirroredRevision) {
			await this._database.markSessionStateRowsMirrored(sessionKey, rowsRevision);
		}
		const marker = `${ROWS_MOVED_PROGRESS}@${maxRowid}`;
		if (progress !== marker) {
			await this._database.markSessionStateRowsMoved(sessionKey, marker);
		}
	}

	/**
	 * Copies the checkpoint rows older builds wrote into the session database on
	 * behalf of peer chats (rows without an event id whose turn the peer's database knows) into
	 * the peer's own database, ref names unchanged. The originals stay, so an older
	 * build still counts their numbers; they are flagged foreign so this build's
	 * default chat ignores them. Rows no peer owns belong to the default chat.
	 */
	private async _moveCheckpoints(sessionDb: ISessionDatabase, snapshot: ISessionStateSnapshot, peers: readonly (readonly [string, string])[]): Promise<void> {
		const defaultChat = defaultChatOf(snapshot);
		if (defaultChat === undefined || peers.length === 0) {
			return;
		}
		const records = await sessionDb.getTurnsWithCheckpointRefs();
		const claimed = new Set<string>();
		for (const [, storage] of peers) {
			// A peer without its own database knows no turn, so it claims no row.
			const ownRef = await this._sessionDataService.tryOpenDatabase(URI.parse(storage));
			if (!ownRef) {
				continue;
			}
			try {
				for (const record of records) {
					// Provider rows of the default chat always carry an event id; a peer's turn is known by its own database through its event id.
					if (record.eventId === undefined && !claimed.has(record.turnId) && await ownRef.object.getTurnEventId(record.turnId) !== undefined) {
						claimed.add(record.turnId);
						if (!await ownRef.object.getTurnCheckpointRef(record.turnId)) {
							await ownRef.object.setTurnCheckpointRef(record.turnId, record.checkpointRef);
						}
					}
				}
			} finally {
				ownRef.dispose();
			}
		}
		const foreign = [...claimed].sort();
		if (records.some(record => record.foreign !== claimed.has(record.turnId))) {
			await sessionDb.setForeignRows(defaultChat, foreign);
		}
	}

	/**
	 * The session's peers stored outside the session database, with their storage: every non-default chat central
	 * state records, and every chat the catalog records (a peer added after the import has no central entry, and a
	 * peer this build created records no storage centrally). Storage as {@link _owner} resolves it: recorded
	 * centrally, else in the normalized catalog, else the creation-time rule.
	 */
	private async _peers(session: URI, snapshot: ISessionStateSnapshot, catalog: ISessionStateKnownCatalog | undefined): Promise<(readonly [string, string])[]> {
		const sessionKey = session.toString();
		const defaultChat = defaultChatOf(snapshot) ?? catalog?.header?.defaultChatUri;
		const catalogStorage = new Map<string, string | undefined>();
		if ((catalog?.authorityVersion ?? snapshot.authority) === 2) {
			for (const chat of catalog?.chats ?? (await this._database.readCatalogSnapshot([sessionKey]))[0]?.chats ?? []) {
				catalogStorage.set(chat.chat, chat.storageResource);
			}
		} else {
			for (const chat of (await this._database.getSessionChatCatalog(sessionKey))?.chats ?? []) {
				catalogStorage.set(chat.chat, undefined);
			}
		}
		const peers: (readonly [string, string])[] = [];
		for (const chat of new Set([...snapshot.chats.keys(), ...catalogStorage.keys()])) {
			const entry = snapshot.chats.get(chat);
			if (chat === defaultChat || entry?.isDefault || this._isDeleted(session, chat)) {
				continue;
			}
			const storage = entry?.storage ?? catalogStorage.get(chat) ?? creationTimeChatStorageResource(sessionKey, chat, defaultChat);
			if (storage !== sessionKey) {
				peers.push([chat, storage]);
			}
		}
		return peers;
	}

	/** Whether no older build wrote the session database's rows since the watermark: one read. */
	private async _isMirrorUnedited(session: URI, peers: readonly (readonly [string, string])[], draftMirrorBases: ReadonlyMap<string, string>, watermark: number): Promise<boolean> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return true;
		}
		try {
			const rows = await ref.object.getRowsWatermark();
			return rows.maxTurnRowid <= watermark && !hasEditedDraft(rows.drafts, peers, draftMirrorBases);
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Imports what an older build edited in the session database mirror since
	 * the recorded merge base: a changed (or cleared) draft wins, rows added
	 * to the mirror are added to the chat's database. Deletions are never
	 * imported — older builds delete peer mirror rows as a side effect of
	 * truncating the default chat.
	 */
	private async _importEdits(sessionDb: ISessionDatabase, ownDb: ISessionDatabase, session: string, chat: string): Promise<void> {
		const chatUri = URI.parse(chat);
		const mirrorDraft = await sessionDb.getChatDraft(chatUri);
		const mirrorDraftBase = mirrorDraft ? JSON.stringify(mirrorDraft) : undefined;
		if (mirrorDraftBase !== await this._database.readChatRowMirror(session, chat, 'draft')) {
			await ownDb.setChatDraft(chatUri, mirrorDraft);
			await this._database.writeChatRowMirror(session, chat, 'draft', mirrorDraftBase);
		}
		const baseIds = new Set<string>(JSON.parse(await this._database.readChatRowMirror(session, chat, 'localTurns') ?? '[]'));
		const ownTurns = await ownDb.getPersistedTurnsForChat(chat);
		const known = new Set([...baseIds, ...ownTurns.map(record => record.turnId)]);
		let added = false;
		for (const record of await sessionDb.getPersistedTurnsForChat(chat)) {
			if (!known.has(record.turnId)) {
				await ownDb.insertPersistedTurn(record);
				baseIds.add(record.turnId);
				added = true;
			}
		}
		if (added) {
			await this._database.writeChatRowMirror(session, chat, 'localTurns', JSON.stringify([...baseIds].sort()));
		}
	}

	private async _hasRows(sessionDb: ISessionDatabase, chat: string): Promise<boolean> {
		return !!await sessionDb.getChatDraft(URI.parse(chat)) || (await sessionDb.getPersistedTurnsForChat(chat)).length > 0;
	}

	private async _copyRows(sessionDb: ISessionDatabase, ownDb: ISessionDatabase, chat: string): Promise<void> {
		const chatUri = URI.parse(chat);
		const draft = await sessionDb.getChatDraft(chatUri);
		if (draft && !await ownDb.getChatDraft(chatUri)) {
			await ownDb.setChatDraft(chatUri, draft);
		}
		const existing = new Set((await ownDb.getPersistedTurnsForChat(chat)).map(record => record.turnId));
		for (const record of await sessionDb.getPersistedTurnsForChat(chat)) {
			if (!existing.has(record.turnId)) {
				await ownDb.insertPersistedTurn(record);
			}
		}
	}

	/** Re-renders the session database rows of `chat` from its own database when the recorded merge base differs. */
	private async _repairMirror(sessionDb: ISessionDatabase, ownDb: ISessionDatabase, session: string, chat: string): Promise<void> {
		const chatUri = URI.parse(chat);
		const ownDraft = await ownDb.getChatDraft(chatUri);
		const draftBase = ownDraft ? JSON.stringify(ownDraft) : undefined;
		if (await this._database.readChatRowMirror(session, chat, 'draft') !== draftBase) {
			await sessionDb.setChatDraft(chatUri, ownDraft);
			await this._database.writeChatRowMirror(session, chat, 'draft', draftBase);
		}
		const ownTurns = await ownDb.getPersistedTurnsForChat(chat);
		const turnsBase_ = turnIdsBase(ownTurns);
		if (await this._database.readChatRowMirror(session, chat, 'localTurns') !== turnsBase_) {
			const own = new Set(ownTurns.map(record => record.turnId));
			await sessionDb.deletePersistedTurns((await sessionDb.getPersistedTurnsForChat(chat)).map(record => record.turnId).filter(id => !own.has(id)));
			for (const record of ownTurns) {
				await sessionDb.insertPersistedTurn(record);
			}
			await this._database.writeChatRowMirror(session, chat, 'localTurns', turnsBase_);
		}
	}
}

/**
 * Whether a peer's draft in the session database differs from the one this build last mirrored there.
 * Accepted false positive: a crash between mirroring a draft and recording its base reads this build's own
 * draft as edited, and the import then writes the value its own database already holds.
 */
function hasEditedDraft(drafts: ReadonlyMap<string, Message>, peers: readonly (readonly [string, string])[], draftMirrorBases: ReadonlyMap<string, string>): boolean {
	return peers.some(([chat]) => {
		const draft = drafts.get(chat);
		return (draft ? JSON.stringify(draft) : undefined) !== draftMirrorBases.get(chat);
	});
}

async function turnsBase(db: ISessionDatabase, chat: string): Promise<string> {
	return turnIdsBase(await db.getPersistedTurnsForChat(chat));
}
