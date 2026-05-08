/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ChatMessage } from './ChatPanel';
import { AgentHandle } from 'son-of-anton-core/agents/types';
import { ChatMode } from 'son-of-anton-core/agents/agentEvents';

/**
 * Maximum number of conversations retained in the store. Once exceeded the
 * oldest entry (by `updatedAt`) is pruned. Bounded to keep `globalState`
 * footprint reasonable on long-running installs.
 */
const MAX_CONVERSATIONS = 50;

/**
 * Maximum number of messages retained per conversation. Excess messages are
 * dropped from the head (oldest first) so a long debugging session doesn't
 * grow unbounded inside a single conversation.
 */
const MAX_MESSAGES_PER_CONVERSATION = 500;

/**
 * Maximum length of an auto-derived conversation title. Titles are derived
 * from the first user message; longer messages are truncated with an ellipsis
 * suffix so the sidebar tree stays readable.
 */
const MAX_TITLE_LENGTH = 50;

const INDEX_KEY = 'sota.conversations.index';
const RECORD_PREFIX = 'sota.conversations.';
const LEGACY_CONVERSATION_KEY = 'sota.chatHistory';
const MIGRATION_FLAG_KEY = 'sota.conversations.migrated';

/**
 * Tab identifiers used by the chat sidebar's top tab bar. Persisted on the
 * conversation summary so the active tab is restored when the user switches
 * between conversations. Legacy conversations without an entry default to
 * `'chat'` — the same surface they always saw.
 */
export type ChatTab = 'chat' | 'tasks' | 'history' | 'settings' | 'roster';

/**
 * Lightweight summary of a conversation surfaced in the history sidebar. The
 * message body lives in a separate per-conversation key so listing N
 * conversations does not require reading N message arrays.
 */
export interface ConversationSummary {
	readonly id: string;
	/** Auto-generated from the first user message; capped at {@link MAX_TITLE_LENGTH} chars. */
	readonly title: string;
	/** Milliseconds since epoch. */
	readonly createdAt: number;
	/** Milliseconds since epoch — updated on every `update()`. */
	readonly updatedAt: number;
	readonly messageCount: number;
	/** Last specialist that authored a turn in this conversation, if any. */
	readonly lastSpecialist?: AgentHandle | 'anton';
	/**
	 * Last Cline-style chat mode the user set in this conversation. Persists
	 * across reloads so flipping into Plan mode in one conversation doesn't
	 * silently leak into another. Defaults to `'act'` when undefined (legacy
	 * conversations created before Phase 58 land here).
	 */
	readonly lastMode?: ChatMode;
	/**
	 * Last chat sidebar tab the user activated in this conversation. Persists
	 * across reloads so flipping to the Roster or Tasks tab in one
	 * conversation doesn't follow the user into another. Defaults to
	 * `'chat'` when undefined (every legacy summary lands here).
	 */
	readonly lastTab?: ChatTab;
}

/**
 * A complete conversation record: summary metadata plus the full message
 * scrollback. Returned by `load()` when the host wants to restore a session.
 */
export interface ConversationRecord {
	readonly summary: ConversationSummary;
	readonly messages: ChatMessage[];
}

/**
 * Generate a v4-shape UUID without pulling in the `crypto` library — works
 * in the Node 22 extension host without additional dependencies. The
 * collision domain is per-install so an RFC4122-compliant id is overkill;
 * any 128-bit random value is fine.
 */
function generateId(): string {
	const bytes = new Uint8Array(16);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	// Variant + version bits per RFC 4122 §4.4 so the id at least *looks* like
	// a UUID v4 to any tools that pattern-match on it.
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Derive a human-readable title from a sequence of chat messages. Picks the
 * first user message and trims it to {@link MAX_TITLE_LENGTH}. Returns
 * `undefined` if no user message exists yet, signalling the placeholder
 * title should be retained.
 */
function deriveTitle(messages: ReadonlyArray<ChatMessage>): string | undefined {
	const firstUser = messages.find(m => m.role === 'user');
	if (!firstUser) {
		return undefined;
	}
	// Structured content (image attachments) is flattened to the first text
	// part so the title still reads as the user's typed prose. Falls back to
	// a generic placeholder when only image parts are present.
	let raw: string;
	if (typeof firstUser.content === 'string') {
		raw = firstUser.content;
	} else {
		const firstText = firstUser.content.find(p => p.type === 'text');
		raw = firstText && firstText.type === 'text' ? firstText.text : '(image attachment)';
	}
	const trimmed = raw.trim().replace(/\s+/g, ' ');
	if (!trimmed) {
		return undefined;
	}
	if (trimmed.length <= MAX_TITLE_LENGTH) {
		return trimmed;
	}
	return `${trimmed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

function recordKey(id: string): string {
	return `${RECORD_PREFIX}${id}`;
}

/**
 * Persists a list of chat conversations in `ExtensionContext.globalState` and
 * exposes a thin CRUD surface for the chat sidebar's history view. Stores the
 * summary index under one key and each conversation's messages under
 * `sota.conversations.<id>` so listing is cheap and loading is targeted.
 *
 * Includes a one-shot migration from the legacy single-conversation key
 * (`sota.chatHistory`, workspaceState) so users upgrading don't lose their
 * existing scrollback — see the constructor.
 */
export class ConversationStore implements vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.migrateLegacyConversation();
	}

	/**
	 * If a legacy `sota.chatHistory` entry exists in workspaceState, import it
	 * as a single conversation in the new store and clear the legacy key. Runs
	 * at most once per install, gated by a globalState flag so subsequent
	 * activations don't re-import a key the user may have intentionally
	 * cleared from the new store.
	 */
	private migrateLegacyConversation(): void {
		const alreadyMigrated = this.context.globalState.get<boolean>(MIGRATION_FLAG_KEY);
		if (alreadyMigrated) {
			return;
		}
		const legacy = this.context.workspaceState.get<ChatMessage[]>(LEGACY_CONVERSATION_KEY);
		if (Array.isArray(legacy) && legacy.length > 0) {
			const id = generateId();
			const now = Date.now();
			const messages = this.trimMessages(legacy);
			const summary: ConversationSummary = {
				id,
				title: deriveTitle(messages) ?? 'Imported conversation',
				createdAt: now,
				updatedAt: now,
				messageCount: messages.length,
			};
			const index = [summary, ...this.readIndex()];
			void this.context.globalState.update(recordKey(id), messages);
			void this.context.globalState.update(INDEX_KEY, this.pruneIndex(index));
		}
		// Clear the legacy key regardless so we don't keep a stale copy around.
		void this.context.workspaceState.update(LEGACY_CONVERSATION_KEY, undefined);
		void this.context.globalState.update(MIGRATION_FLAG_KEY, true);
	}

	/** Returns the conversation summaries, newest-first by `updatedAt`. */
	list(): ReadonlyArray<ConversationSummary> {
		return [...this.readIndex()].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/** Returns the full record for a conversation, or `undefined` if missing. */
	load(id: string): ConversationRecord | undefined {
		const summary = this.readIndex().find(s => s.id === id);
		if (!summary) {
			return undefined;
		}
		const messages = this.context.globalState.get<ChatMessage[]>(recordKey(id)) ?? [];
		return { summary, messages };
	}

	/**
	 * Create a new conversation with a generated id and a placeholder title.
	 * The title gets replaced on the first `update()` once a user message
	 * arrives. Returns the freshly-created record so the caller can use it
	 * without an extra `load()` round-trip.
	 */
	create(initialMessages?: ChatMessage[]): ConversationRecord {
		const id = generateId();
		const now = Date.now();
		const messages = this.trimMessages(initialMessages ?? []);
		const derived = deriveTitle(messages);
		const summary: ConversationSummary = {
			id,
			title: derived ?? 'New conversation',
			createdAt: now,
			updatedAt: now,
			messageCount: messages.length,
		};
		const index = [summary, ...this.readIndex()];
		void this.context.globalState.update(recordKey(id), messages);
		void this.context.globalState.update(INDEX_KEY, this.pruneIndex(index));
		this._onDidChange.fire();
		return { summary, messages };
	}

	/**
	 * Persist the latest message list for the given conversation. Refreshes
	 * `updatedAt`, recomputes `messageCount`, optionally records the
	 * `lastSpecialist`, the `lastMode`, and the `lastTab`, and (when the
	 * title is still the placeholder) derives a real title from the first
	 * user message.
	 */
	update(
		id: string,
		messages: ChatMessage[],
		lastSpecialist?: AgentHandle | 'anton',
		lastMode?: ChatMode,
		lastTab?: ChatTab,
	): void {
		const index = this.readIndex();
		const existing = index.find(s => s.id === id);
		if (!existing) {
			return;
		}
		const trimmed = this.trimMessages(messages);
		const next: ConversationSummary = {
			id: existing.id,
			title: this.shouldRederiveTitle(existing.title)
				? deriveTitle(trimmed) ?? existing.title
				: existing.title,
			createdAt: existing.createdAt,
			updatedAt: Date.now(),
			messageCount: trimmed.length,
			lastSpecialist: lastSpecialist ?? existing.lastSpecialist,
			lastMode: lastMode ?? existing.lastMode,
			lastTab: lastTab ?? existing.lastTab,
		};
		const updatedIndex = index.map(s => (s.id === id ? next : s));
		void this.context.globalState.update(recordKey(id), trimmed);
		void this.context.globalState.update(INDEX_KEY, this.pruneIndex(updatedIndex));
		this._onDidChange.fire();
	}

	/**
	 * Rename a conversation. Trims surrounding whitespace and caps the title
	 * length so a malformed input box payload can't poison the index.
	 */
	rename(id: string, newTitle: string): void {
		const index = this.readIndex();
		const existing = index.find(s => s.id === id);
		if (!existing) {
			return;
		}
		const cleaned = newTitle.trim().slice(0, MAX_TITLE_LENGTH);
		if (!cleaned) {
			return;
		}
		const next: ConversationSummary = {
			...existing,
			title: cleaned,
			updatedAt: Date.now(),
		};
		const updatedIndex = index.map(s => (s.id === id ? next : s));
		void this.context.globalState.update(INDEX_KEY, updatedIndex);
		this._onDidChange.fire();
	}

	/** Delete a conversation and its message body. */
	delete(id: string): void {
		const index = this.readIndex();
		if (!index.some(s => s.id === id)) {
			return;
		}
		const updatedIndex = index.filter(s => s.id !== id);
		void this.context.globalState.update(recordKey(id), undefined);
		void this.context.globalState.update(INDEX_KEY, updatedIndex);
		this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	private readIndex(): ConversationSummary[] {
		const raw = this.context.globalState.get<ConversationSummary[]>(INDEX_KEY);
		return Array.isArray(raw) ? raw : [];
	}

	/**
	 * Cap the index at {@link MAX_CONVERSATIONS} entries by dropping the
	 * oldest (lowest `updatedAt`). The corresponding message bodies are also
	 * cleared so we don't leak orphaned globalState keys.
	 */
	private pruneIndex(index: ConversationSummary[]): ConversationSummary[] {
		if (index.length <= MAX_CONVERSATIONS) {
			return index;
		}
		const sorted = [...index].sort((a, b) => b.updatedAt - a.updatedAt);
		const kept = sorted.slice(0, MAX_CONVERSATIONS);
		const dropped = sorted.slice(MAX_CONVERSATIONS);
		for (const summary of dropped) {
			void this.context.globalState.update(recordKey(summary.id), undefined);
		}
		return kept;
	}

	/**
	 * Cap message count per conversation at
	 * {@link MAX_MESSAGES_PER_CONVERSATION}, dropping the oldest entries.
	 */
	private trimMessages(messages: ReadonlyArray<ChatMessage>): ChatMessage[] {
		if (messages.length <= MAX_MESSAGES_PER_CONVERSATION) {
			return [...messages];
		}
		return messages.slice(messages.length - MAX_MESSAGES_PER_CONVERSATION);
	}

	/**
	 * Determine whether the title is still a placeholder we should overwrite
	 * on the next `update()`. We only re-derive when the user hasn't already
	 * picked a custom name via `rename()`.
	 */
	private shouldRederiveTitle(currentTitle: string): boolean {
		return currentTitle === 'New conversation' || currentTitle === 'Imported conversation';
	}
}
