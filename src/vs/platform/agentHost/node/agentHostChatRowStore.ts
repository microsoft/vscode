/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentHostChatRowStore, ISessionStateExclusive, ISessionStateSnapshot } from '../common/agentHostSessionStateStore.js';
import type { IPersistedTurnRecord, ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import type { Message } from '../common/state/sessionState.js';
import { creationTimeChatStorageResource } from './agentHostStateManager.js';
import type { IAgentHostDatabase } from './agentHostDatabase.js';

/** Progress recorded by `sessionStateRowsMoved:<session>` once the per-chat rows were copied. */
export const ROWS_MOVED_PROGRESS = 'rows';

/** The chat's storage and whether its rows are mirrored into the session database. */
function resolveStorage(session: URI, snapshot: ISessionStateSnapshot, chat: string): { readonly storage: URI; readonly mirrored: boolean } {
	const sessionKey = session.toString();
	let defaultChat: string | undefined;
	for (const [uri, entry] of snapshot.chats) {
		if (entry.isDefault) {
			defaultChat = uri;
		}
	}
	const storage = snapshot.chats.get(chat)?.storage ?? creationTimeChatStorageResource(sessionKey, chat, defaultChat);
	return { storage: URI.parse(storage), mirrored: storage !== sessionKey };
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
	) { }

	getDraft(session: URI, chat: URI): Promise<Message | undefined> {
		return this._read(session, chat, db => db.getChatDraft(chat), undefined);
	}

	async getPersistedTurns(session: URI, chat: URI): Promise<Array<IPersistedTurnRecord & { seq: number }>> {
		return this._read(session, chat, db => db.getPersistedTurnsForChat(chat.toString()), []);
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

	private _read<T>(session: URI, chat: URI, read: (db: ISessionDatabase) => Promise<T>, fallback: T): Promise<T> {
		return this._runExclusive(session, async exclusive => {
			// A chat the central state does not know has no authoritative storage yet; its rows, if any, are in the session database.
			const storage = exclusive.snapshot.chats.has(chat.toString()) ? resolveStorage(session, exclusive.snapshot, chat.toString()).storage : session;
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
		return this._runExclusive(session, async exclusive => {
			const { storage, mirrored } = resolveStorage(session, exclusive.snapshot, chat.toString());
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
			}
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
	 */
	async moveRows(session: URI, snapshot: ISessionStateSnapshot, progress: string | undefined, rowsRevision: number, rowsMirroredRevision: number): Promise<void> {
		const sessionKey = session.toString();
		const peers = [...snapshot.chats].filter(([, entry]) => !entry.isDefault && entry.storage !== undefined && entry.storage !== sessionKey);
		if (progress === ROWS_MOVED_PROGRESS && rowsRevision === rowsMirroredRevision) {
			return;
		}
		const sessionRef = await this._sessionDataService.tryOpenDatabase(session);
		if (!sessionRef) {
			await this._database.markSessionStateRowsMoved(sessionKey, ROWS_MOVED_PROGRESS);
			return;
		}
		try {
			for (const [chat, entry] of peers) {
				const lagging = rowsRevision > rowsMirroredRevision;
				if (!lagging && !await this._hasRows(sessionRef.object, chat)) {
					continue;
				}
				const storage = URI.parse(entry.storage!);
				const ownRef = this._sessionDataService.openDatabase(storage);
				try {
					if (progress !== ROWS_MOVED_PROGRESS) {
						await this._copyRows(sessionRef.object, ownRef.object, chat);
					}
					await this._repairMirror(sessionRef.object, ownRef.object, sessionKey, chat);
				} finally {
					ownRef.dispose();
				}
			}
		} finally {
			sessionRef.dispose();
		}
		if (rowsRevision > rowsMirroredRevision) {
			await this._database.markSessionStateRowsMirrored(sessionKey, rowsRevision);
		}
		if (progress !== ROWS_MOVED_PROGRESS) {
			await this._database.markSessionStateRowsMoved(sessionKey, ROWS_MOVED_PROGRESS);
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

async function turnsBase(db: ISessionDatabase, chat: string): Promise<string> {
	return turnIdsBase(await db.getPersistedTurnsForChat(chat));
}
