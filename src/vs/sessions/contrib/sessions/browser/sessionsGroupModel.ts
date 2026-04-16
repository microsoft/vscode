/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const SESSIONS_GROUPS_STORAGE_KEY = 'sessions.groups';

interface ISerializedSessionGroup {
	readonly sessionId: string;
	readonly chatIds: string[];
	readonly activeChatIndex: number;
}

export interface ISessionsGroupModelChange {
	readonly sessionId: string;
}

export interface ISessionsGroupModelChatAddedChange {
	readonly sessionId: string;
	readonly chatId: string;
}

interface Group {
	readonly chatIds: string[];
	activeChatIndex: number;
}

/**
 * Model that tracks which chats belong to which session group.
 * Persisted via IStorageService so data survives window reload.
 *
 * Every group always has at least one chat and an active chat.
 * Removing the last chat from a group deletes the group.
 */
export class SessionsGroupModel extends Disposable {

	private readonly _groups = new Map<string, Group>();

	private readonly _onDidChange = this._register(new Emitter<ISessionsGroupModelChange>());
	readonly onDidChange: Event<ISessionsGroupModelChange> = this._onDidChange.event;

	private readonly _onDidAddChatToSession = this._register(new Emitter<ISessionsGroupModelChatAddedChange>());
	readonly onDidAddChatToSession: Event<ISessionsGroupModelChatAddedChange> = this._onDidAddChatToSession.event;

	constructor(
		private readonly _storageService: IStorageService,
	) {
		super();
		this._load();
	}

	/**
	 * Returns all session IDs that have groups.
	 */
	getSessionIds(): string[] {
		return [...this._groups.keys()];
	}

	/**
	 * Returns the chat IDs belonging to a session group, or an empty array
	 * if the session does not exist.
	 */
	getChatIds(sessionId: string): readonly string[] {
		return this._groups.get(sessionId)?.chatIds ?? [];
	}

	/**
	 * Returns the session ID that contains the given chat, or `undefined`
	 * if the chat is not in any group.
	 */
	getSessionIdForChat(chatId: string): string | undefined {
		for (const [sessionId, group] of this._groups) {
			if (group.chatIds.includes(chatId)) {
				return sessionId;
			}
		}
		return undefined;
	}

	/**
	 * Returns the active chat ID for a session group.
	 * @throws if the session does not exist.
	 */
	getActiveChatId(sessionId: string): string {
		const group = this._groups.get(sessionId);
		if (!group) {
			throw new Error(`Session group '${sessionId}' does not exist`);
		}
		return group.chatIds[group.activeChatIndex];
	}

	/**
	 * Returns whether a session group exists for the given session ID.
	 */
	hasGroupForSession(sessionId: string): boolean {
		return this._groups.has(sessionId);
	}

	/**
	 * Sets the active chat for its session group. The chat must belong to
	 * a group. If it does not, this is a no-op.
	 */
	setActiveChatId(chatId: string): void {
		const sessionId = this.getSessionIdForChat(chatId);
		if (!sessionId) {
			return;
		}
		const group = this._groups.get(sessionId)!;
		const idx = group.chatIds.indexOf(chatId);
		if (group.activeChatIndex === idx) {
			return;
		}
		group.activeChatIndex = idx;
		this._save();
		this._onDidChange.fire({ sessionId });
	}

	/**
	 * Adds a chat to a session group. Creates the session group if it does
	 * not exist yet. The first chat added becomes the active chat.
	 * Adding the same chat twice is a no-op.
	 */
	addChat(sessionId: string, chatId: string): void {
		let group = this._groups.get(sessionId);
		if (!group) {
			group = { chatIds: [], activeChatIndex: 0 };
			this._groups.set(sessionId, group);
		}
		if (group.chatIds.includes(chatId)) {
			return;
		}
		group.chatIds.push(chatId);
		this._save();
		this._onDidChange.fire({ sessionId });
		this._onDidAddChatToSession.fire({ sessionId, chatId });
	}

	/**
	 * Removes a chat from its session group. If the chat is not in
	 * any group this is a no-op. If it was the last chat in the group,
	 * the group is deleted.
	 */
	removeChat(chatId: string): void {
		for (const [sessionId, group] of this._groups) {
			const idx = group.chatIds.indexOf(chatId);
			if (idx !== -1) {
				group.chatIds.splice(idx, 1);
				if (group.chatIds.length === 0) {
					this._groups.delete(sessionId);
				} else if (group.activeChatIndex >= group.chatIds.length) {
					group.activeChatIndex = group.chatIds.length - 1;
				} else if (idx < group.activeChatIndex) {
					group.activeChatIndex--;
				}
				this._save();
				this._onDidChange.fire({ sessionId });
				return;
			}
		}
	}

	/**
	 * Atomically replaces a chat ID in its group, keeping the same position.
	 * Fires a single change event. No-op if the old chat is not found.
	 */
	replaceChat(oldChatId: string, newChatId: string): void {
		for (const [sessionId, group] of this._groups) {
			const idx = group.chatIds.indexOf(oldChatId);
			if (idx !== -1) {
				group.chatIds[idx] = newChatId;
				this._save();
				this._onDidChange.fire({ sessionId });
				return;
			}
		}
	}

	/**
	 * Deletes an entire session group and all its chat associations.
	 */
	deleteSession(sessionId: string): void {
		if (!this._groups.delete(sessionId)) {
			return;
		}
		this._save();
		this._onDidChange.fire({ sessionId });
	}

	// #region Persistence

	private _load(): void {
		const raw = this._storageService.get(SESSIONS_GROUPS_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}

		if (!Array.isArray(parsed)) {
			return;
		}

		for (const entry of parsed) {
			if (
				typeof entry === 'object' && entry !== null &&
				typeof (entry as ISerializedSessionGroup).sessionId === 'string' &&
				Array.isArray((entry as ISerializedSessionGroup).chatIds)
			) {
				const chatIds = (entry as ISerializedSessionGroup).chatIds.filter(
					(id: unknown): id is string => typeof id === 'string',
				);
				if (chatIds.length === 0) {
					continue;
				}
				const sid = (entry as ISerializedSessionGroup).sessionId;
				const activeChatIndex = (entry as Record<string, unknown>).activeChatIndex;
				this._groups.set(sid, {
					chatIds,
					activeChatIndex: typeof activeChatIndex === 'number' && activeChatIndex >= 0 && activeChatIndex < chatIds.length
						? activeChatIndex
						: 0,
				});
			}
		}
	}

	private _save(): void {
		const data: ISerializedSessionGroup[] = [];
		for (const [sessionId, group] of this._groups) {
			data.push({ sessionId, chatIds: group.chatIds, activeChatIndex: group.activeChatIndex });
		}
		this._storageService.store(
			SESSIONS_GROUPS_STORAGE_KEY,
			JSON.stringify(data),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}

	// #endregion
}
