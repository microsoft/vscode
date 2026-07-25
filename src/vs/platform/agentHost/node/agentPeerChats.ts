/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { renderResponseMarkdown, truncateMiddle } from '../common/agentHostConversationContext.js';
import { type ActiveTurn, type ModelSelection, type Turn } from '../common/state/protocol/state.js';

const SIDE_CHAT_CONTEXT_START = '<side-chat-context>';
const SIDE_CHAT_CONTEXT_END = '</side-chat-context>';
const SIDE_CHAT_CONTEXT_LENGTH_PREFIX = 'length=';
const SIDE_CHAT_GUIDANCE = 'This is a side conversation. Prefer explanation over action; do not make changes or carry out work unless the user explicitly asks.';
export const MAX_SIDE_CHAT_CONTEXT_CHARS = 20_000;

export interface IPersistedSideChat {
	readonly source: string;
	readonly turnId: string;
	readonly selection?: { readonly text: string; readonly responsePartId?: string };
	readonly providerAnchorTurnId?: string;
	readonly inheritedTurnCount: number;
	readonly partialResponse?: string;
	readonly context?: string;
}

export function buildSideChatSourceContext(turns: readonly Turn[], activeTurn?: ActiveTurn): string | undefined {
	const blocks: string[] = [];
	for (const turn of turns) {
		const block = buildSideChatContextBlock(turn.message.text, renderResponseMarkdown(turn.responseParts));
		if (block) {
			blocks.push(block);
		}
	}
	if (activeTurn) {
		const block = buildSideChatContextBlock(activeTurn.message.text, undefined);
		if (block) {
			blocks.push(block);
		}
	}
	if (blocks.length === 0) {
		return undefined;
	}
	const conversation = blocks.join('\n\n---\n\n');
	return conversation.length > MAX_SIDE_CHAT_CONTEXT_CHARS ? truncateMiddle(conversation, MAX_SIDE_CHAT_CONTEXT_CHARS) : conversation;
}

export function getSideChatPartialResponse(activeTurn: ActiveTurn | undefined): string | undefined {
	if (!activeTurn) {
		return undefined;
	}
	const responseMarkdown = renderResponseMarkdown(activeTurn.responseParts);
	return responseMarkdown ? truncateMiddle(responseMarkdown, MAX_SIDE_CHAT_CONTEXT_CHARS) : undefined;
}

export function buildBoundedSideChatSourceContext(turns: readonly Turn[], turnId: string, activeTurn?: ActiveTurn): string | undefined {
	if (activeTurn?.id === turnId) {
		return buildSideChatSourceContext(turns, activeTurn);
	}
	const turnIndex = turns.findIndex(turn => turn.id === turnId);
	return turnIndex === -1 ? undefined : buildSideChatSourceContext(turns.slice(0, turnIndex + 1));
}

export function injectSideChatContext(prompt: string, partialResponse?: string, sourceContext?: string, selectionText?: string): string {
	const context = [SIDE_CHAT_GUIDANCE];
	if (selectionText) {
		context.push(
			'',
			'Selected text:',
			'',
			selectionText,
		);
	}
	if (sourceContext) {
		context.push(
			'',
			'Source conversation up to the branching point:',
			'',
			sourceContext,
		);
	}
	if (partialResponse) {
		context.push(
			'',
			'The side chat was created while the source assistant was still responding.',
			'The user-visible response had produced the following text at that moment:',
			'',
			partialResponse,
		);
	}
	const contextBody = context.join('\n');
	return [SIDE_CHAT_CONTEXT_START, `${SIDE_CHAT_CONTEXT_LENGTH_PREFIX}${contextBody.length}`, contextBody, SIDE_CHAT_CONTEXT_END, '', prompt].join('\n');
}

export function prepareSideChatPrompt(prompt: string, turns: readonly Turn[], sideChat: IPersistedSideChat | undefined): string {
	if (!sideChat || turns.length > sideChat.inheritedTurnCount) {
		return prompt;
	}
	const selectedSourceTurn = turns.find(turn => turn.id === sideChat.turnId);
	const sourceContext = selectedSourceTurn ? undefined : sideChat.context;
	let partialResponse = sideChat.partialResponse;
	if (partialResponse) {
		const inheritedResponse = selectedSourceTurn ? renderResponseMarkdown(selectedSourceTurn.responseParts) : '';
		if (inheritedResponse.includes(partialResponse)) {
			partialResponse = undefined;
		}
	}
	return injectSideChatContext(prompt, partialResponse, sourceContext, sideChat.selection?.text);
}

function buildSideChatContextBlock(message: string, response: string | undefined): string | undefined {
	const userText = message.trim();
	const responseText = response?.trim();
	if (!userText && !responseText) {
		return undefined;
	}
	return responseText
		? `User request:\n${userText}\n\nAgent response:\n${responseText}`
		: `User request:\n${userText}`;
}

export function stripSideChatContext(turns: readonly Turn[], sideChat: IPersistedSideChat | undefined): readonly Turn[] {
	if (!sideChat || turns.length === 0) {
		return turns;
	}
	const first = turns[0];
	const text = first.message.text;
	if (!text.startsWith(SIDE_CHAT_CONTEXT_START)) {
		return turns;
	}
	const lengthHeaderStart = SIDE_CHAT_CONTEXT_START.length + 1;
	if (text.slice(lengthHeaderStart).startsWith(SIDE_CHAT_CONTEXT_LENGTH_PREFIX)) {
		const lengthLineEnd = text.indexOf('\n', lengthHeaderStart);
		const parsedLength = lengthLineEnd > 0
			? Number.parseInt(text.slice(lengthHeaderStart + SIDE_CHAT_CONTEXT_LENGTH_PREFIX.length, lengthLineEnd), 10)
			: Number.NaN;
		if (Number.isInteger(parsedLength) && parsedLength >= 0) {
			const contextStart = lengthLineEnd + 1;
			const contextEnd = contextStart + parsedLength;
			if (text.slice(contextEnd, contextEnd + SIDE_CHAT_CONTEXT_END.length + 1) === `\n${SIDE_CHAT_CONTEXT_END}`) {
				const userPrompt = text.slice(contextEnd + SIDE_CHAT_CONTEXT_END.length + 1).trimStart();
				return [{ ...first, message: { ...first.message, text: userPrompt } }, ...turns.slice(1)];
			}
		}
	}
	const endIndex = text.lastIndexOf(SIDE_CHAT_CONTEXT_END);
	if (endIndex < 0) {
		return turns;
	}
	const userPrompt = text.slice(endIndex + SIDE_CHAT_CONTEXT_END.length).trimStart();
	return [{ ...first, message: { ...first.message, text: userPrompt } }, ...turns.slice(1)];
}

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
	readonly sideChat?: IPersistedSideChat;
}

export interface IResolvedAgentChat<TSession extends IDisposable> {
	readonly chatSession: TSession;
	readonly isDefault: boolean;
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
		const value = JSON.parse(providerData) as { sdkSessionId?: unknown; model?: unknown; sideChat?: unknown };
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
		const sideChat = value.sideChat as { source?: unknown; turnId?: unknown; selection?: unknown; providerAnchorTurnId?: unknown; inheritedTurnCount?: unknown; partialResponse?: unknown; context?: unknown } | undefined;
		const validSelection = sideChat?.selection
			&& typeof sideChat.selection === 'object'
			&& typeof (sideChat.selection as { text?: unknown }).text === 'string'
			&& (((sideChat.selection as { responsePartId?: unknown }).responsePartId) === undefined || typeof (sideChat.selection as { responsePartId?: unknown }).responsePartId === 'string')
			? {
				text: (sideChat.selection as { text: string }).text,
				...((sideChat.selection as { responsePartId?: string }).responsePartId ? { responsePartId: (sideChat.selection as { responsePartId?: string }).responsePartId } : {}),
			}
			: undefined;
		const validSideChat = sideChat
			&& typeof sideChat.source === 'string'
			&& typeof sideChat.turnId === 'string'
			&& (sideChat.providerAnchorTurnId === undefined || typeof sideChat.providerAnchorTurnId === 'string')
			&& typeof sideChat.inheritedTurnCount === 'number'
			&& (sideChat.partialResponse === undefined || typeof sideChat.partialResponse === 'string')
			&& (sideChat.context === undefined || typeof sideChat.context === 'string')
			? {
				source: sideChat.source,
				turnId: sideChat.turnId,
				...(validSelection ? { selection: validSelection } : {}),
				...(sideChat.providerAnchorTurnId ? { providerAnchorTurnId: sideChat.providerAnchorTurnId } : {}),
				inheritedTurnCount: sideChat.inheritedTurnCount,
				...(sideChat.partialResponse ? { partialResponse: sideChat.partialResponse } : {}),
				...(sideChat.context ? { context: sideChat.context } : {}),
			}
			: undefined;
		return { sdkSessionId, ...(validModel ? { model: validModel } : {}), ...(validSideChat ? { sideChat: validSideChat } : {}) };
	} catch {
		return undefined;
	}
}

/**
 * Per-session container shared by the multi-chat agents. Keeps ALL chats of a
 * session — the default (main) chat and any additional peer chats — together in
 * ONE per-agent map keyed by each chat's channel URI string (no parallel maps,
 * no default-vs-peer storage split). The default chat is just the entry marked
 * as default, so send/abort/model/agent/history operations resolve any chat by a
 * single uniform {@link getChat} lookup with no default-chat resolution branch.
 *
 * Each entry can act as a leaf (wrapping one {@link ownSession} plus its
 * event-forwarding disposables) or as the container (holding the chat map).
 * Disposing the container disposes every chat leaf it holds.
 */
export class AgentSessionEntry<TSession extends IDisposable> extends Disposable {
	/** All chats of the session (default + peers) as leaf entries, keyed by chat-URI string. */
	private readonly _chats = this._register(new DisposableMap<string, AgentSessionEntry<TSession>>());
	/** The key of the session's default (main) chat within {@link _chats}. */
	private _defaultChatKey: string | undefined;
	/** This leaf's own chat session (set when the entry wraps a single chat). */
	private _ownSession: TSession | undefined;

	constructor(session?: TSession) {
		super();
		if (session) {
			this._ownSession = session;
			this._register(session);
		}
	}

	/** This leaf's own chat session, or `undefined` for a bare container. */
	get ownSession(): TSession | undefined {
		return this._ownSession;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	// ---- Uniform chat map (default + peers) --------------------------------

	/** Register the session's default (main) chat leaf under its chat-URI key. */
	setDefaultChat(chatKey: string, entry: AgentSessionEntry<TSession>): void {
		this._chats.set(chatKey, entry);
		this._defaultChatKey = chatKey;
	}

	/** Dispose the default chat leaf (e.g. a config-driven restart) while keeping peer chats. */
	clearDefaultChat(): void {
		if (this._defaultChatKey !== undefined) {
			this._chats.deleteAndDispose(this._defaultChatKey);
			this._defaultChatKey = undefined;
		}
	}

	/** The session's materialized default (main) chat, or `undefined` while provisional. */
	get defaultChat(): TSession | undefined {
		return this._defaultChatKey !== undefined ? this._chats.get(this._defaultChatKey)?.ownSession : undefined;
	}

	/** Uniform lookup: the chat's session (default OR peer) by its chat-URI key. */
	getChat(chatKey: string): TSession | undefined {
		return this._chats.get(chatKey)?.ownSession;
	}

	/** Uniform lookup with default-vs-peer identity from the entry that resolved the chat. */
	resolveChat(chatKey: string): IResolvedAgentChat<TSession> | undefined {
		const chatSession = this._chats.get(chatKey)?.ownSession;
		if (!chatSession) {
			return undefined;
		}
		return { chatSession, isDefault: chatKey === this._defaultChatKey };
	}

	/** Every live chat session — the default chat plus all peers. */
	allChatSessions(): TSession[] {
		const sessions: TSession[] = [];
		for (const entry of this._chats.values()) {
			if (entry.ownSession) {
				sessions.push(entry.ownSession);
			}
		}
		return sessions;
	}

	// ---- Peer chats (every chat except the default) ------------------------

	getPeerChat(chatKey: string): TSession | undefined {
		return chatKey === this._defaultChatKey ? undefined : this._chats.get(chatKey)?.ownSession;
	}

	hasPeerChat(chatKey: string): boolean {
		return chatKey !== this._defaultChatKey && this._chats.has(chatKey);
	}

	registerPeerChat(chatKey: string, entry: AgentSessionEntry<TSession>): void {
		this._chats.set(chatKey, entry);
	}

	disposePeerChat(chatKey: string): void {
		if (chatKey !== this._defaultChatKey) {
			this._chats.deleteAndDispose(chatKey);
		}
	}

	peerChatKeys(): string[] {
		return [...this._chats.keys()].filter(key => key !== this._defaultChatKey);
	}

	peerChatSessions(): TSession[] {
		const sessions: TSession[] = [];
		for (const key of this._chats.keys()) {
			if (key === this._defaultChatKey) {
				continue;
			}
			const session = this._chats.get(key)?.ownSession;
			if (session) {
				sessions.push(session);
			}
		}
		return sessions;
	}
}
