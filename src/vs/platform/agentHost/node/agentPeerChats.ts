/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { type ModelSelection } from '../common/state/protocol/state.js';

/**
 * In-memory backing for an additional (non-default) peer chat. Records the SDK
 * chat id that backs the chat so it can be re-resumed after a process restart,
 * along with any model override chosen at creation time. This is also the shape
 * serialized into the opaque, agent-owned `providerData` blob the orchestrator
 * persists in its chat catalog and hands back on restore.
 */
export interface IPersistedChat {
	readonly sdkSessionId: string;
	readonly model?: ModelSelection;
}

/**
 * Serializes a peer-chat backing into the opaque `providerData` token the
 * orchestrator persists verbatim. The encoding is the agent's private business
 * — today it is the JSON of {@link IPersistedChat}.
 */
export function encodeProviderData(backing: IPersistedChat): string {
	return JSON.stringify(backing);
}

/**
 * Decodes an opaque `providerData` token produced by {@link encodeProviderData}
 * back into a peer-chat backing, tolerating corrupt/foreign blobs by returning
 * `undefined` (the same drop-on-corrupt policy as the legacy chat catalog read).
 */
export function decodeProviderData(providerData: string): IPersistedChat | undefined {
	try {
		const value = JSON.parse(providerData) as { sdkSessionId?: unknown; model?: unknown };
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const { sdkSessionId, model } = value;
		if (typeof sdkSessionId !== 'string' || !sdkSessionId) {
			return undefined;
		}
		// The blob is client-influenced and may be corrupted or shape-shifted by
		// a future serialization change: only accept a `model` that actually
		// looks like a `ModelSelection`.
		const validModel = model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string'
			? model as ModelSelection
			: undefined;
		return { sdkSessionId, ...(validModel ? { model: validModel } : {}) };
	} catch {
		return undefined;
	}
}

/**
 * Per-session container shared by the multi-chat agents. Owns the session's
 * default (main) chat and any additional peer chats, keeping all chats of a
 * session together in a single per-agent map (no parallel maps). The default
 * chat is optional because a session can exist as a provisional record whose
 * SDK-backed default chat has not materialized yet — a peer chat may still be
 * created on it. Disposing the entry disposes the default chat and every peer
 * chat.
 */
export class AgentSessionEntry<TSession extends IDisposable> extends Disposable {
	private readonly _defaultSession = this._register(new MutableDisposable<TSession>());
	/** Additional (non-default) peer chats, keyed by chat URI string. */
	private readonly _peerChats = this._register(new DisposableMap<string, AgentSessionEntry<TSession>>());

	constructor(session?: TSession) {
		super();
		if (session) {
			this._defaultSession.value = session;
		}
	}

	/** The session's materialized default (main) chat, or `undefined` while provisional. */
	get session(): TSession | undefined {
		return this._defaultSession.value;
	}

	/** Assign the materialized default chat, disposing any prior one. */
	setSession(session: TSession): void {
		this._defaultSession.value = session;
	}

	/** Dispose the default chat (e.g. a config-driven restart) while keeping peer chats. */
	clearSession(): void {
		this._defaultSession.clear();
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	getPeerChat(chatKey: string): TSession | undefined {
		return this._peerChats.get(chatKey)?.session;
	}

	hasPeerChat(chatKey: string): boolean {
		return this._peerChats.has(chatKey);
	}

	registerPeerChat(chatKey: string, entry: AgentSessionEntry<TSession>): void {
		this._peerChats.set(chatKey, entry);
	}

	disposePeerChat(chatKey: string): void {
		this._peerChats.deleteAndDispose(chatKey);
	}

	peerChatKeys(): string[] {
		return [...this._peerChats.keys()];
	}

	peerChatSessions(): TSession[] {
		const sessions: TSession[] = [];
		for (const entry of this._peerChats.values()) {
			if (entry.session) {
				sessions.push(entry.session);
			}
		}
		return sessions;
	}
}
