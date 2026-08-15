/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	LanguageModelChatMessageRole,
	LanguageModelDataPart,
	LanguageModelPromptTsxPart,
	LanguageModelTextPart,
	LanguageModelThinkingPart,
	LanguageModelToolCallPart,
	LanguageModelToolResultPart,
} from '../../../vscodeTypes';

/**
 * The union of message types that can flow through the language model API.
 * `LanguageModelChatMessage2` carries a broader set of content parts (e.g.
 * thinking parts), so we accept both.
 */
export type CacheAwareChatMessage = vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2;

/**
 * Cache-aware conversation history manager.
 *
 * The goal is to maximise KV-cache hits on self-hosted OpenAI-compatible
 * endpoints (DeepSeek / DS4 / vLLM / llama.cpp with disk KV). Those servers
 * cache the key/value tensors of the prompt prefix, so a request that shares a
 * long common prefix with the previous request can reuse most of the cached
 * work instead of recomputing it.
 *
 * Strategy:
 *  1. First request of a conversation -> send only the system prompt + the
 *     latest user message (a small prefill).
 *  2. Subsequent requests -> keep sending a growing history that shares the
 *     longest possible common prefix with the previous request, so the server
 *     can hit as many cached tokens as possible.
 *  3. When the projected token count approaches `maxInputTokens`, drop the
 *     oldest non-system turns (or summarise them) so the new request still
 *     shares a long, stable prefix.
 *  4. Never re-send a completely divergent history if a long common prefix is
 *     still available.
 */

export interface CacheAwareHistoryConfig {
	/** Enable the cache-aware history manager. */
	readonly enabled: boolean;
	/** How aggressively to truncate when over budget. */
	readonly truncationPolicy: 'conservative' | 'aggressive';
	/** Whether to insert a short summary of dropped turns. */
	readonly summarizeDroppedTurns: boolean;
  /**
   * Fraction of `maxInputTokens` that is the "floor": the target size we
   * truncate back to when the history exceeds the ceiling (0 < value <= 1).
   */
  readonly minUtilization: number;
  /**
   * Fraction of `maxInputTokens` that is the "ceiling": the maximum size we
   * allow the history to grow to before truncating back to the floor
   * (0 < value <= 1, >= `minUtilization`).
   */
  readonly maxUtilization: number;
  /** Minimum number of recent turns to always keep (excluding system). */
  readonly minRecentTurns: number;
}

export const DefaultCacheAwareHistoryConfig: CacheAwareHistoryConfig = {
  enabled: true,
  truncationPolicy: 'conservative',
  summarizeDroppedTurns: false,
  minUtilization: 0.5,
  maxUtilization: 1.0,
  minRecentTurns: 2,
};

/**
 * Per-conversation state. Keyed by a stable conversation id derived from the
 * system prompt + first user message, so it survives across requests within a
 * single VS Code session.
 *
 * Lifetime: this state lives only in memory (a bounded LRU map in
 * `languageModelAccess.ts`) and is intentionally not persisted across VS Code
 * reloads. On a fresh session the first request of a conversation is treated as
 * a new prefill, which is correct for the cache-aware goal — there is no server
 * KV cache to reuse across process restarts anyway.
 */
export interface ConversationState {
	/** The exact messages we last sent to the server. */
	readonly lastSentMessages: readonly CacheAwareChatMessage[];
	/** Approximate token count of `lastSentMessages`. */
	readonly lastTokenCount: number;
	/** Optional running summary of turns that were dropped. */
	readonly summary?: string;
}

/**
 * A token counter. `(messages) => number` returning an approximate count.
 */
export type TokenCounter = (messages: readonly CacheAwareChatMessage[]) => number;

/**
 * Result of preparing messages for a request.
 */
export interface PreparedMessages {
	/** The messages to send to the server. */
	readonly messagesToSend: readonly CacheAwareChatMessage[];
	/** The updated conversation state to persist. */
	readonly newState: ConversationState;
	/** Whether the history was truncated to fit the budget. */
	readonly truncated: boolean;
	/** Approximate token count of `messagesToSend`. */
	readonly tokenCount: number;
	/**
	 * Whether `messagesToSend` extends the exact prefix we last sent, so the
	 * server's KV cache can be reused. `false` when there was no prior state,
	 * when the history diverged from the last-sent prefix, or after truncation.
	 */
	readonly extendsLastSent: boolean;
}

/**
 * Derives a stable conversation id from the system prompt + first user message.
 * This is the identity that lets us correlate successive requests of the same
 * conversation even though `ProvideLanguageModelChatResponseOptions` does not
 * expose a session id.
 *
 * Limitation: the id is derived from the system prompt + first user message, so
 * if the system prompt is rewritten mid-conversation (common with dynamic
 * context / tools / instructions), the id changes and the per-conversation
 * state is lost. This is a deliberate trade-off given the API exposes no stable
 * session id; `prepareMessagesForRequest` additionally guards against a
 * rewritten system prompt by resetting state rather than reusing stale state.
 */
export function deriveConversationId(messages: readonly CacheAwareChatMessage[]): string {
	const systemText = messages
		.filter(m => m.role === LanguageModelChatMessageRole.System)
		.map(m => textOf(m))
		.join('\n');
	const firstUser = messages.find(m => m.role === LanguageModelChatMessageRole.User);
	const firstUserText = firstUser ? textOf(firstUser) : '';
	return hashString(`${systemText}\u0000${firstUserText}`);
}

/**
 * Computes the length of the longest common prefix (in messages) between two
 * message lists. Messages are compared structurally (role + text content).
 */
export function longestCommonPrefixLength(
	a: readonly CacheAwareChatMessage[],
	b: readonly CacheAwareChatMessage[],
): number {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && messagesEqual(a[i], b[i])) {
		i++;
	}
	return i;
}

/**
 * Approximate token counter based on character count. Good enough for the
 * cache-aware truncation decisions; exact counting can be swapped in later.
 *
 * Unlike `textOf`, this serializes *all* content parts (tool-call arguments,
 * tool results, thinking payloads, data parts, prompt-tsx) so that non-text
 * content that dominates an agent transcript is still counted toward the
 * budget instead of being treated as zero tokens.
 */
export function approximateTokenCount(messages: readonly CacheAwareChatMessage[]): number {
	let chars = 0;
	for (const message of messages) {
		chars += serializedLength(message);
	}
	// ~4 characters per token is a common heuristic for English text.
	return Math.ceil(chars / 4);
}

/**
 * The core cache-aware message preparation routine.
 *
 * @param fullHistory The complete conversation history as provided by VS Code.
 * @param state The previous conversation state, if any.
 * @param maxInputTokens The maximum number of input tokens the model accepts.
 * @param tokenCounter Approximate token counter.
 * @param config Cache-aware policy configuration.
 */
export function prepareMessagesForRequest(
	fullHistory: readonly CacheAwareChatMessage[],
	state: ConversationState | undefined,
	maxInputTokens: number,
	tokenCounter: TokenCounter = approximateTokenCount,
	config: CacheAwareHistoryConfig = DefaultCacheAwareHistoryConfig,
): PreparedMessages {
	if (!config.enabled) {
		const tokenCount = tokenCounter(fullHistory);
		return {
			messagesToSend: fullHistory,
			newState: { lastSentMessages: fullHistory, lastTokenCount: tokenCount },
			truncated: false,
			tokenCount,
			extendsLastSent: false,
		};
	}

// The "ceiling" is the maximum size the history may grow to before we
  // truncate; the "floor" is the target size we truncate back to. This
  // sawtooth keeps the prefix stable: the history grows by appending turns up
  // to the ceiling, then drops back to the floor, so the server's KV cache
  // keeps hitting the same long prefix.
  const ceiling = Math.floor(maxInputTokens * config.maxUtilization);
  const floor = Math.floor(maxInputTokens * config.minUtilization);

  // 1. First request of a conversation -> small prefill: system + latest user.
  if (!state) {
    const prefill = buildPrefill(fullHistory);
    const tokenCount = tokenCounter(prefill);
    return {
      messagesToSend: prefill,
      newState: { lastSentMessages: prefill, lastTokenCount: tokenCount },
      truncated: false,
      tokenCount,
      extendsLastSent: false,
    };
  }

  // 1b. If the system prompt was rewritten since the last request (common
  //     with dynamic context / tools / instructions), the previously cached
  //     prefix is invalid. Deliberately reset state and start a fresh prefill
  //     rather than silently reusing stale state that no longer matches the
  //     incoming history.
  if (!systemMessagesEqual(state.lastSentMessages, fullHistory)) {
    const prefill = buildPrefill(fullHistory);
    const tokenCount = tokenCounter(prefill);
    return {
      messagesToSend: prefill,
      newState: { lastSentMessages: prefill, lastTokenCount: tokenCount },
      truncated: false,
      tokenCount,
      extendsLastSent: false,
    };
  }

  // 2. If the full history fits within the ceiling, send it. Because the
  //    history grows by appending new turns, this naturally shares a long
  //    common prefix with the previous request, which the server's KV cache
  //    can hit.
  const candidate = fullHistory;
  const candidateTokens = tokenCounter(candidate);

  if (candidateTokens <= ceiling) {
    // Only claim the cache can be reused if the candidate actually extends
    // the exact prefix we last sent. If an earlier system/context/history
    // message was rewritten, the prefix diverges and the cache is invalid.
    const extendsLastSent = extendsPrefix(state.lastSentMessages, candidate);
    return {
      messagesToSend: candidate,
      newState: { lastSentMessages: candidate, lastTokenCount: candidateTokens },
      truncated: false,
      tokenCount: candidateTokens,
      extendsLastSent,
    };
  }

  // 3. Over the ceiling: drop the oldest non-system turns until we reach the
  //    floor, keeping the system prompt + as many recent turns as possible.
  //    Prefer keeping a prefix that overlaps with what we last sent so the
  //    cache still hits.
  const { messagesToSend, dropped } = truncateToBudget(fullHistory, floor, tokenCounter, config);

  let summary: string | undefined;
  if (config.summarizeDroppedTurns && dropped.length > 0) {
    summary = summarizeDropped(dropped, state.summary);
  }

  // When summarising dropped turns, inject the running summary as a stable
  // early system message, immediately after the existing system messages.
  // Placing it here (rather than appending a changing system message at the
  // end) keeps the summary inside the immutable prefix, so subsequent requests
  // still share a long stable prefix with the server's KV cache.
  let messagesToSendWithSummary = messagesToSend;
  if (summary) {
    const system = messagesToSend.filter(m => m.role === LanguageModelChatMessageRole.System);
    const nonSystem = messagesToSend.filter(m => m.role !== LanguageModelChatMessageRole.System);
    messagesToSendWithSummary = [
      ...system,
      new vscode.LanguageModelChatMessage(LanguageModelChatMessageRole.System, summary),
      ...nonSystem,
    ];
  }
  const finalTokenCount = tokenCounter(messagesToSendWithSummary);

  return {
    messagesToSend: messagesToSendWithSummary,
    newState: { lastSentMessages: messagesToSendWithSummary, lastTokenCount: finalTokenCount, summary },
    truncated: dropped.length > 0,
    tokenCount: finalTokenCount,
    extendsLastSent: false,
  };
}

/**
 * Builds the initial small prefill: system prompt(s) + the latest user message.
 * This keeps the first request tiny so the server's KV cache starts from a
 * minimal prefix; subsequent requests then grow the history from here.
 *
 * If the latest user message carries a tool result (i.e. the caller supplied a
 * pre-populated transcript rather than a fresh first turn), we cannot emit an
 * orphan tool result without its preceding assistant tool-call message — that
 * would be rejected by OpenAI-compatible endpoints. In that case we fall back
 * to sending the full history so the tool-call/tool-result exchange stays
 * intact.
 */
function buildPrefill(
	fullHistory: readonly CacheAwareChatMessage[],
): readonly CacheAwareChatMessage[] {
	const system = fullHistory.filter(m => m.role === LanguageModelChatMessageRole.System);
	// Find the latest user message (the actual prompt for this request).
	const latestUser = [...fullHistory].reverse().find(m => m.role === LanguageModelChatMessageRole.User);
	if (!latestUser) {
		return system;
	}
	// If the latest user message contains a tool result, the transcript was
	// pre-populated mid-tool-exchange. Sending only system + this message would
	// orphan the tool result, so send the full history instead.
	if (containsToolResult(latestUser)) {
		return fullHistory;
	}
	return [...system, latestUser];
}

/**
 * Drops the oldest non-system turns until the message list fits within the
 * budget. Always keeps the system prompt(s) and the most recent turns.
 *
 * Tool-call/tool-result exchanges are truncated atomically: an assistant
 * message that issues tool calls is never dropped while its matching user
 * tool-result message is kept (and vice-versa), because an orphan tool result
 * would be rejected by OpenAI-compatible endpoints.
 */
function truncateToBudget(
	fullHistory: readonly CacheAwareChatMessage[],
	budget: number,
	tokenCounter: TokenCounter,
	config: CacheAwareHistoryConfig,
): { messagesToSend: readonly CacheAwareChatMessage[]; dropped: readonly CacheAwareChatMessage[] } {
	const system = fullHistory.filter(m => m.role === LanguageModelChatMessageRole.System);
	const nonSystem = fullHistory.filter(m => m.role !== LanguageModelChatMessageRole.System);

	// The truncation policy controls how much history we keep when over budget.
	// `conservative` keeps one extra recent turn (more context) and drops only
	// as much as needed to fit the budget. `aggressive` keeps only the
	// configured minimum and drops down to it whenever truncation is required,
	// preserving a longer stable prefix for the KV cache at the cost of context.
	const keepCount = config.truncationPolicy === 'aggressive'
		? Math.max(config.minRecentTurns, 1)
		: Math.max(config.minRecentTurns + 1, 2);
	const kept = nonSystem.slice(-keepCount);
	const droppable = nonSystem.slice(0, -keepCount);

	const dropped: CacheAwareChatMessage[] = [];
	let candidate = fullHistory;

	if (config.truncationPolicy === 'aggressive') {
		// Aggressive: drop all droppable messages so future requests share the
		// longest possible stable prefix.
		dropped.push(...droppable);
		candidate = [...system, ...kept];
	} else {
		// Conservative: drop from the oldest end of the droppable region only
		// until the candidate fits within the budget.
		for (let i = 0; i < droppable.length; i++) {
			if (tokenCounter(candidate) <= budget) {
				break;
			}
			// Drop the next droppable message, but if it is part of a
			// tool-call/tool-result exchange, drop the whole exchange atomically.
			const dropCount = exchangeSpan(droppable, i);
			for (let j = 0; j < dropCount; j++) {
				dropped.push(droppable[i + j]);
			}
			i += dropCount - 1;
			candidate = [...system, ...droppable.slice(i + 1), ...kept];
		}
	}

	// If we still don't fit (e.g. a single turn is huge), fall back to the
	// most recent turns only, dropping from the front of `kept` as needed.
	if (tokenCounter(candidate) > budget) {
		const trimmed = [...kept];
		while (trimmed.length > 1 && tokenCounter([...system, ...trimmed]) > budget) {
			dropped.push(trimmed.shift()!);
		}
		candidate = [...system, ...trimmed];
	}

	return { messagesToSend: candidate, dropped };
}

/**
 * Returns the number of consecutive messages starting at `index` that form a
 * single tool-call/tool-result exchange and must be dropped together.
 *
 * - An assistant message with tool calls is grouped with the immediately
 *   following user tool-result message(s).
 * - A user tool-result message is grouped with the immediately preceding
 *   assistant tool-call message.
 * - Otherwise the span is a single message.
 */
function exchangeSpan(messages: readonly CacheAwareChatMessage[], index: number): number {
	const message = messages[index];
	if (message.role === LanguageModelChatMessageRole.Assistant && containsToolCall(message)) {
		// Group with the following user tool-result message(s).
		let span = 1;
		while (index + span < messages.length && messages[index + span].role === LanguageModelChatMessageRole.User && containsToolResult(messages[index + span])) {
			span++;
		}
		return span;
	}
	if (message.role === LanguageModelChatMessageRole.User && containsToolResult(message)) {
		// Group with the preceding assistant tool-call message.
		if (index > 0 && messages[index - 1].role === LanguageModelChatMessageRole.Assistant && containsToolCall(messages[index - 1])) {
			return 2;
		}
	}
	return 1;
}

/**
 * Produces a short summary of dropped turns. Currently a simple placeholder
 * that lists how many turns were dropped; a real implementation could call a
 * cheap model to summarise the dropped content.
 */
function summarizeDropped(dropped: readonly CacheAwareChatMessage[], previousSummary: string | undefined): string {
	const count = dropped.length;
	const base = `[Earlier conversation turns omitted to fit the context window (${count} turn${count === 1 ? '' : 's'} dropped).]`;
	return previousSummary ? `${previousSummary}\n${base}` : base;
}

function textOf(message: CacheAwareChatMessage): string {
	const content = message.content;
	if (typeof content === 'string') {
		return content;
	}
	return content
		.filter(part => part instanceof LanguageModelTextPart)
		.map(part => (part as LanguageModelTextPart).value)
		.join('');
}

/**
 * Serializes the full content of a message to a canonical string, including
 * non-text parts (tool-call arguments, tool results, thinking payloads, data
 * parts, prompt-tsx). This mirrors what the renderer actually sends to the
 * endpoint, so both token estimation and equality checks are not biased toward
 * text-only transcripts.
 */
function serializeMessage(message: CacheAwareChatMessage): string {
        const content = message.content;
        if (typeof content === 'string') {
                return content;
        }
        const parts: string[] = [];
        for (const part of content) {
                if (part instanceof LanguageModelTextPart) {
                        parts.push((part as LanguageModelTextPart).value);
                } else if (part instanceof LanguageModelToolCallPart) {
                        const toolCall = part as LanguageModelToolCallPart;
                        try {
                                parts.push(`tool:${toolCall.name}:${JSON.stringify(toolCall.input ?? {})}`);
                        } catch {
                                // Non-serializable input — fall back to the name only.
                                parts.push(`tool:${toolCall.name}`);
                        }
                } else if (part instanceof LanguageModelToolResultPart) {
                        const toolResult = part as LanguageModelToolResultPart;
                        const inner: string[] = [];
                        for (const contentPart of toolResult.content) {
                                if (contentPart instanceof LanguageModelTextPart) {
                                        inner.push((contentPart as LanguageModelTextPart).value);
                                } else if (contentPart instanceof LanguageModelPromptTsxPart) {
                                        try {
                                                inner.push(JSON.stringify((contentPart as LanguageModelPromptTsxPart).value));
                                        } catch {
                                                // Non-serializable value — ignore.
                                        }
                                } else if (typeof contentPart === 'string') {
                                        inner.push(contentPart);
                                }
                        }
                        parts.push(`result:${inner.join('')}`);
                } else if (part instanceof LanguageModelThinkingPart) {
                        const thinking = part as LanguageModelThinkingPart;
                        const value = thinking.value;
                        parts.push(`thinking:${typeof value === 'string' ? value : value.join('')}`);
                } else if (part instanceof LanguageModelDataPart) {
                        const data = part as LanguageModelDataPart;
                        // Approximate binary data by its byte length (base64 inflates ~4/3).
                        parts.push(`data:${data.mimeType}:${data.data ? data.data.byteLength : 0}`);
                }
        }
        return parts.join('\u0000');
}

/**
 * Returns the serialized length of a message's full content, used for token
 * estimation. See {@link serializeMessage}.
 */
function serializedLength(message: CacheAwareChatMessage): number {
        return serializeMessage(message).length;
}

function containsToolCall(message: CacheAwareChatMessage): boolean {
	const content = message.content;
	if (typeof content === 'string') {
		return false;
	}
	return content.some(part => part instanceof LanguageModelToolCallPart);
}

function containsToolResult(message: CacheAwareChatMessage): boolean {
	const content = message.content;
	if (typeof content === 'string') {
		return false;
	}
	return content.some(part => part instanceof LanguageModelToolResultPart);
}

/**
 * Returns true if `candidate` extends the exact message prefix `prefix` (i.e.
 * `prefix` is a prefix of `candidate`). This is the condition under which the
 * server's KV cache for the previously-sent prefix can be reused.
 */
function extendsPrefix(prefix: readonly CacheAwareChatMessage[], candidate: readonly CacheAwareChatMessage[]): boolean {
	if (candidate.length < prefix.length) {
		return false;
	}
	for (let i = 0; i < prefix.length; i++) {
		if (!messagesEqual(prefix[i], candidate[i])) {
			return false;
		}
	}
	return true;
}

function messagesEqual(a: CacheAwareChatMessage, b: CacheAwareChatMessage): boolean {
	if (a.role !== b.role) {
		return false;
	}
        // Compare the full serialized content, not just text. Two messages that
        // differ only in non-text parts (tool-call IDs, tool results, thinking,
        // data parts) produce a different token stream, so they must not be treated
        // as equal — otherwise `extendsLastSent` could claim a cache hit that the
        // server would actually miss.
        return serializeMessage(a) === serializeMessage(b);
}

/**
 * Returns true if the system messages of two message lists are identical
 * (same count, same order, same full content). Used to detect a rewritten
 * system prompt so state can be deliberately reset instead of silently reused.
 */
function systemMessagesEqual(a: readonly CacheAwareChatMessage[], b: readonly CacheAwareChatMessage[]): boolean {
        const aSystem = a.filter(m => m.role === LanguageModelChatMessageRole.System);
        const bSystem = b.filter(m => m.role === LanguageModelChatMessageRole.System);
        if (aSystem.length !== bSystem.length) {
                return false;
        }
        for (let i = 0; i < aSystem.length; i++) {
                if (!messagesEqual(aSystem[i], bSystem[i])) {
                        return false;
                }
        }
        return true;
}

/**
 * Simple, dependency-free string hash (FNV-1a). Used to derive a stable
 * conversation id without pulling in a crypto dependency.
 */
function hashString(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}
