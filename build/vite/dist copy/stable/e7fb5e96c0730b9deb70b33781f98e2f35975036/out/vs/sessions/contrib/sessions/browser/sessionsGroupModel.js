/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
const SESSIONS_GROUPS_STORAGE_KEY = 'sessions.groups';
/**
 * Model that tracks which chats belong to which session group.
 * Persisted via IStorageService so data survives window reload.
 *
 * Every group always has at least one chat and an active chat.
 * Removing the last chat from a group deletes the group.
 */
export class SessionsGroupModel extends Disposable {
    constructor(_storageService) {
        super();
        this._storageService = _storageService;
        this._groups = new Map();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._onDidAddChatToSession = this._register(new Emitter());
        this.onDidAddChatToSession = this._onDidAddChatToSession.event;
        this._load();
    }
    /**
     * Returns all session IDs that have groups.
     */
    getSessionIds() {
        return [...this._groups.keys()];
    }
    /**
     * Returns the chat IDs belonging to a session group, or an empty array
     * if the session does not exist.
     */
    getChatIds(sessionId) {
        return this._groups.get(sessionId)?.chatIds ?? [];
    }
    /**
     * Returns the session ID that contains the given chat, or `undefined`
     * if the chat is not in any group.
     */
    getSessionIdForChat(chatId) {
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
    getActiveChatId(sessionId) {
        const group = this._groups.get(sessionId);
        if (!group) {
            throw new Error(`Session group '${sessionId}' does not exist`);
        }
        return group.chatIds[group.activeChatIndex];
    }
    /**
     * Returns whether a session group exists for the given session ID.
     */
    hasGroupForSession(sessionId) {
        return this._groups.has(sessionId);
    }
    /**
     * Sets the active chat for its session group. The chat must belong to
     * a group. If it does not, this is a no-op.
     */
    setActiveChatId(chatId) {
        const sessionId = this.getSessionIdForChat(chatId);
        if (!sessionId) {
            return;
        }
        const group = this._groups.get(sessionId);
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
    addChat(sessionId, chatId) {
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
    removeChat(chatId) {
        for (const [sessionId, group] of this._groups) {
            const idx = group.chatIds.indexOf(chatId);
            if (idx !== -1) {
                group.chatIds.splice(idx, 1);
                if (group.chatIds.length === 0) {
                    this._groups.delete(sessionId);
                }
                else if (group.activeChatIndex >= group.chatIds.length) {
                    group.activeChatIndex = group.chatIds.length - 1;
                }
                else if (idx < group.activeChatIndex) {
                    group.activeChatIndex--;
                }
                this._save();
                this._onDidChange.fire({ sessionId });
                return;
            }
        }
    }
    /**
     * Deletes an entire session group and all its chat associations.
     */
    deleteSession(sessionId) {
        if (!this._groups.delete(sessionId)) {
            return;
        }
        this._save();
        this._onDidChange.fire({ sessionId });
    }
    // #region Persistence
    _load() {
        const raw = this._storageService.get(SESSIONS_GROUPS_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (!raw) {
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (!Array.isArray(parsed)) {
            return;
        }
        for (const entry of parsed) {
            if (typeof entry === 'object' && entry !== null &&
                typeof entry.sessionId === 'string' &&
                Array.isArray(entry.chatIds)) {
                const chatIds = entry.chatIds.filter((id) => typeof id === 'string');
                if (chatIds.length === 0) {
                    continue;
                }
                const sid = entry.sessionId;
                const activeChatIndex = entry.activeChatIndex;
                this._groups.set(sid, {
                    chatIds,
                    activeChatIndex: typeof activeChatIndex === 'number' && activeChatIndex >= 0 && activeChatIndex < chatIds.length
                        ? activeChatIndex
                        : 0,
                });
            }
        }
    }
    _save() {
        const data = [];
        for (const [sessionId, group] of this._groups) {
            data.push({ sessionId, chatIds: group.chatIds, activeChatIndex: group.activeChatIndex });
        }
        this._storageService.store(SESSIONS_GROUPS_STORAGE_KEY, JSON.stringify(data), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNHcm91cE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zR3JvdXBNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2xFLE1BQU0sMkJBQTJCLEdBQUcsaUJBQWlCLENBQUM7QUFzQnREOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxVQUFVO0lBVWpELFlBQ2tCLGVBQWdDO1FBRWpELEtBQUssRUFBRSxDQUFDO1FBRlMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBVGpDLFlBQU8sR0FBRyxJQUFJLEdBQUcsRUFBaUIsQ0FBQztRQUVuQyxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTZCLENBQUMsQ0FBQztRQUNoRixnQkFBVyxHQUFxQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUVoRSwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFzQyxDQUFDLENBQUM7UUFDbkcsMEJBQXFCLEdBQThDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUM7UUFNN0csSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2QsQ0FBQztJQUVEOztPQUVHO0lBQ0gsYUFBYTtRQUNaLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsVUFBVSxDQUFDLFNBQWlCO1FBQzNCLE9BQU8sSUFBSSxDQUFDLE9BQU8s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