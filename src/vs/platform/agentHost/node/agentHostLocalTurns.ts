/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import type { ILocalTurnRecord, ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import type { Turn } from '../common/state/sessionState.js';

/**
 * Tracks host-injected ("local") turns — completed protocol turns the agent SDK
 * never saw, such as the `/rename` acknowledgement or a `!command` terminal run.
 *
 * These turns exist only in the agent host: they are never forwarded to the
 * agent SDK, so they are absent from the SDK transcript that
 * {@link AgentService} replays on restore. This registry persists them (so they
 * survive reload) and remembers, for each, the id of the preceding concrete
 * (SDK-backed) turn — the *anchor* — so that fork/truncate operations targeting
 * a local turn can be redirected to the concrete SDK message before it.
 *
 * Everything is scoped to a **chat** (its channel URI): a session's default
 * chat and each of its peer chats are handled identically. Persistence lives in
 * the owning session's database (one per session, shared across its chats),
 * discriminated by {@link ILocalTurnRecord.chatUri}.
 */
export class AgentHostLocalTurns {

	/** chat URI → (localTurnId → { anchorTurnId, seq }). */
	private readonly _byChat = new Map<string, Map<string, { readonly anchorTurnId: string | undefined; readonly seq: number }>>();
	/** session URI → highest `seq` assigned so far (seq is session-global for stable ordering). */
	private readonly _seqBySession = new Map<string, number>();

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
	) { }

	/** Whether `turnId` is a known host-injected local turn in `chat`. */
	isLocal(chat: string, turnId: string): boolean {
		return this._byChat.get(chat)?.has(turnId) ?? false;
	}

	/** All known local turn ids for `chat`. */
	getLocalTurnIds(chat: string): string[] {
		const map = this._byChat.get(chat);
		return map ? [...map.keys()] : [];
	}

	/**
	 * Resolves `turnId` to the concrete (SDK-backed) turn a fork/truncate should
	 * operate on within `chat`. For a local turn this is its anchor (the
	 * preceding real turn, or `undefined` when it precedes any real turn); for a
	 * concrete turn it is the turn itself.
	 */
	resolveConcreteTurnId(chat: string, turnId: string): string | undefined {
		const entry = this._byChat.get(chat)?.get(turnId);
		return entry ? entry.anchorTurnId : turnId;
	}

	/**
	 * Persist a local turn and remember it in memory. `anchorTurnId` is the id
	 * of the preceding concrete turn in `chat` (or `undefined` when there is
	 * none). `session` identifies the database to persist into.
	 */
	record(session: string, chat: string, turn: Turn, anchorTurnId: string | undefined): void {
		const seq = (this._seqBySession.get(session) ?? 0) + 1;
		this._noteInMemory(session, chat, turn.id, anchorTurnId, seq);
		const record: ILocalTurnRecord = { turnId: turn.id, chatUri: chat, anchorTurnId, seq, payload: JSON.stringify(turn) };
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentHostLocalTurns] Failed to open database to persist local turn ${turn.id}`, err);
			return;
		}
		ref.object.insertLocalTurn(record).catch(err => {
			this._logService.warn(`[AgentHostLocalTurns] Failed to persist local turn ${turn.id}`, err);
		}).finally(() => ref.dispose());
	}

	/**
	 * Loads persisted local turns for `session`, populating the in-memory index
	 * (keyed by each record's chat), and returns the records for `chat` in
	 * `seq` order so the caller can interleave them into that chat's SDK-derived
	 * turns during restore.
	 */
	async loadForChat(session: string, chat: string): Promise<ILocalTurnRecord[]> {
		const records = await this._load(session);
		return records.filter(r => r.chatUri === chat);
	}

	/** Note a local turn in memory only (used by fork seeding). */
	noteInMemory(session: string, chat: string, turnId: string, anchorTurnId: string | undefined, seq: number): void {
		this._noteInMemory(session, chat, turnId, anchorTurnId, seq);
	}

	/** Delete the given local turns from memory and the session database. */
	deleteLocals(session: string, turnIds: readonly string[]): void {
		if (turnIds.length === 0) {
			return;
		}
		const idSet = new Set(turnIds);
		for (const map of this._byChat.values()) {
			for (const id of idSet) {
				map.delete(id);
			}
		}
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentHostLocalTurns] Failed to open database to delete local turns for ${session}`, err);
			return;
		}
		ref.object.deleteLocalTurns(turnIds).catch(err => {
			this._logService.warn(`[AgentHostLocalTurns] Failed to delete local turns for ${session}`, err);
		}).finally(() => ref.dispose());
	}

	/** Drop all in-memory state for a chat. */
	forgetChat(chat: string): void {
		this._byChat.delete(chat);
	}

	private async _load(session: string): Promise<ILocalTurnRecord[]> {
		const ref = this._sessionDataService.tryOpenDatabase?.(URI.parse(session));
		if (!ref) {
			return [];
		}
		try {
			const db = await ref;
			if (!db) {
				return [];
			}
			try {
				const records = await db.object.getLocalTurns();
				for (const r of records) {
					this._noteInMemory(session, r.chatUri, r.turnId, r.anchorTurnId, r.seq);
				}
				return records;
			} finally {
				db.dispose();
			}
		} catch (err) {
			this._logService.warn(`[AgentHostLocalTurns] Failed to load local turns for ${session}`, err);
			return [];
		}
	}

	private _noteInMemory(session: string, chat: string, turnId: string, anchorTurnId: string | undefined, seq: number): void {
		let map = this._byChat.get(chat);
		if (!map) {
			map = new Map();
			this._byChat.set(chat, map);
		}
		map.set(turnId, { anchorTurnId, seq });
		this._seqBySession.set(session, Math.max(this._seqBySession.get(session) ?? 0, seq));
	}
}
