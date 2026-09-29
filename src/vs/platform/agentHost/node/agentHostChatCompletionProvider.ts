/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { ChatInteractivity, ChatOriginKind, MessageAttachmentKind } from '../common/state/protocol/state.js';
import { buildDefaultChatUri, isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../common/state/sessionState.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { AgentHostStateManager, resolveChatStateForUri } from './agentHostStateManager.js';

/** Maximum number of chat completion items returned per call. */
const MAX_RESULTS = 20;

/** The literal prefix (after `#`) that introduces a chat reference. */
const CHAT_PREFIX = 'chat:';

/**
 * Result of {@link extractChatToken}.
 */
export interface IChatToken {
	/**
	 * The title filter typed after `#chat:` (empty while the user is still
	 * typing the `chat:` prefix itself). Used to match candidate chat titles.
	 */
	readonly typed: string;
	/** Start offset of the replaced range (the `#`). */
	readonly rangeStart: number;
	/** End offset of the replaced range (the cursor). */
	readonly rangeEnd: number;
}

/**
 * Walk back from `offset` to the nearest `#` that is at start-of-input or
 * preceded by whitespace (aborting if whitespace is hit first), then decide
 * whether the token being typed could still become a `#chat:` reference.
 *
 * Returns the title filter (the text after `#chat:`) together with the range to
 * replace, or `undefined` when the token cannot become a `#chat:` reference —
 * so this provider does not fight the file completion provider over plain
 * `#file` tokens.
 *
 * Because the token is whitespace-terminated, title filtering only works up to
 * the first space (the same accepted limitation as the `#session:` UX); no
 * quoting is supported.
 *
 * Exported for unit testing.
 */
export function extractChatToken(text: string, offset: number): IChatToken | undefined {
	if (offset < 0 || offset > text.length) {
		return undefined;
	}
	for (let i = offset - 1; i >= 0; i--) {
		const ch = text.charCodeAt(i);
		// whitespace terminates the search
		if (ch === 0x20 /* space */ || ch === 0x09 /* tab */ || ch === 0x0a /* \n */ || ch === 0x0d /* \r */) {
			return undefined;
		}
		if (text[i] === CompletionTriggerCharacter.Hash) {
			// The `#` must be at start-of-input or preceded by whitespace.
			if (i > 0) {
				const prev = text.charCodeAt(i - 1);
				const prevIsWs = prev === 0x20 || prev === 0x09 || prev === 0x0a || prev === 0x0d;
				if (!prevIsWs) {
					return undefined;
				}
			}
			const raw = text.slice(i + 1, offset);
			const lower = raw.toLowerCase();
			if (lower.startsWith(CHAT_PREFIX)) {
				// Fully-typed prefix: the remainder is the title filter.
				return { typed: raw.slice(CHAT_PREFIX.length), rangeStart: i, rangeEnd: offset };
			}
			if (CHAT_PREFIX.startsWith(lower)) {
				// Still typing the `chat:` prefix (e.g. `#`, `#ch`): no title yet.
				return { typed: '', rangeStart: i, rangeEnd: offset };
			}
			return undefined;
		}
	}
	return undefined;
}

/**
 * Collapse internal whitespace runs to single spaces and trim, so the inserted
 * `#chat:<title>` token and the attachment `label` stay on one line.
 */
function sanitizeChatTitle(title: string): string {
	return title.replace(/\s+/g, ' ').trim();
}

/**
 * Completion provider that lets a user reference another chat in the same
 * session from a chat input using the syntax `#chat:<Chat title>`.
 *
 * Accepting a completion attaches a {@link MessageAttachmentKind.Chat}
 * attachment (protocol `MessageChatAttachment`) whose `endTurn` pins the
 * referenced transcript to the chat's last completed turn at completion time.
 */
export class AgentHostChatCompletionProvider implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);

	readonly triggerCharacters: readonly string[] = [CompletionTriggerCharacter.Hash];

	constructor(
		private readonly _stateManager: AgentHostStateManager,
	) { }

	async provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]> {
		const chatToken = extractChatToken(params.text, params.offset);
		if (!chatToken) {
			return [];
		}

		const session = this._stateManager.getSessionState(params.channel);
		if (!session) {
			return [];
		}

		// The channel is a chat URI, but the session's default chat may be
		// addressed either by the session URI or by the default chat URI. Derive
		// the owning session URI and its canonical default chat URI so the
		// current chat is reliably excluded regardless of how it was addressed.
		const sessionUri = isAhpChatChannel(params.channel) ? parseRequiredSessionUriFromChatUri(params.channel) : params.channel;
		const defaultChatUri = session.defaultChat ?? buildDefaultChatUri(sessionUri);
		const currentChatId = this._canonicalChatId(params.channel, sessionUri, defaultChatUri);

		const filter = sanitizeChatTitle(chatToken.typed).toLowerCase();

		const candidates = session.chats
			.filter(chat => {
				// Never list the current chat.
				if (this._canonicalChatId(chat.resource, sessionUri, defaultChatUri) === currentChatId) {
					return false;
				}
				// Exclude subagent chats spawned by a tool call.
				if (chat.origin?.kind === ChatOriginKind.Tool) {
					return false;
				}
				// Exclude hidden worker chats: they are internal and have no
				// user-visible title to reference. Read-only chats are kept — a
				// read-only chat is still shown for observability, so its
				// transcript is legitimate context to attach.
				if (chat.interactivity === ChatInteractivity.Hidden) {
					return false;
				}
				// Case-insensitive substring match on the sanitized title.
				if (filter && !sanitizeChatTitle(chat.title).toLowerCase().includes(filter)) {
					return false;
				}
				return true;
			})
			// Newest first.
			.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));

		const items: CompletionItem[] = [];
		for (const chat of candidates) {
			if (token.isCancellationRequested || items.length >= MAX_RESULTS) {
				break;
			}
			// Pin the reference to the chat's last completed turn. A chat with no
			// completed turn (only an active turn, or empty) cannot be resolved
			// into an attachment, so skip it.
			//
			// `endTurn` is deliberately pinned here — at completion-accept time —
			// rather than when the message is eventually sent. This keeps the
			// referenced transcript fixed to exactly what the user saw when they
			// picked this chat; later turns on that chat do not silently extend
			// the attached context.
			const endTurn = this._lastCompletedTurnId(chat.resource);
			if (!endTurn) {
				continue;
			}
			const sanitizedTitle = sanitizeChatTitle(chat.title);
			items.push({
				insertText: `#chat:${sanitizedTitle} `,
				rangeStart: chatToken.rangeStart,
				rangeEnd: chatToken.rangeEnd,
				attachment: {
					type: MessageAttachmentKind.Chat,
					resource: chat.resource,
					endTurn,
					label: sanitizedTitle,
				},
			});
		}
		return items;
	}

	/**
	 * Normalize a session/chat URI to a single identity string, collapsing every
	 * alias of the session's default chat (the session URI, the default chat
	 * URI, and the session's `defaultChat` field) onto one value.
	 */
	private _canonicalChatId(uri: string, sessionUri: string, defaultChatUri: string): string {
		const normalizedDefault = URI.parse(defaultChatUri).toString();
		const normalized = URI.parse(uri).toString();
		if (normalized === URI.parse(sessionUri).toString() || isDefaultChatUri(uri)) {
			return normalizedDefault;
		}
		return normalized;
	}

	/**
	 * The id of the chat's last completed turn, or `undefined` when it has none.
	 * Uses the shared {@link resolveChatStateForUri} so it derives turns the same
	 * way as the server-side chat-attachment resolver.
	 */
	private _lastCompletedTurnId(chatUri: string): string | undefined {
		const turns = resolveChatStateForUri(this._stateManager, chatUri)?.turns;
		return turns && turns.length > 0 ? turns[turns.length - 1].id : undefined;
	}
}
