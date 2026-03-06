/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Context window management middleware.
 *
 * Monitors approximate token usage and applies compaction strategies when the
 * conversation approaches the context window limit. Two-phase compaction:
 *
 * 1. **Prune tool outputs**: Walk backwards through tool results. Keep the most
 *    recent outputs verbatim; replace older tool outputs with short summaries.
 *    This is cheap (no LLM call needed) and handles the biggest context
 *    consumers.
 *
 * 2. If still over budget after pruning, the caller can implement an LLM-based
 *    summarization strategy via the {@link ICompactionStrategy} interface.
 */

import { IConversationMessage, IToolResultMessage } from '../../common/conversation.js';
import { IMiddleware, IPreRequestContext, IPreRequestResult } from '../../common/middleware.js';

// -- Configuration ------------------------------------------------------------

export interface IContextWindowConfig {
	/** Maximum context window size in estimated tokens. */
	readonly maxContextTokens: number;
	/**
	 * Trigger compaction when estimated token usage exceeds this fraction
	 * of the max context window (0-1). Default: 0.8
	 */
	readonly compactionThreshold?: number;
	/**
	 * Number of most recent tool results to keep verbatim.
	 * Default: 3
	 */
	readonly recentToolResultsToKeep?: number;
	/**
	 * Maximum characters to keep from a tool output when pruning.
	 * Default: 200
	 */
	readonly prunedOutputMaxLength?: number;
}

// -- Token estimation ---------------------------------------------------------

/**
 * Rough token estimation: ~4 characters per token for English text.
 * This is intentionally conservative to avoid cutting too aggressively.
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: IConversationMessage): number {
	switch (msg.role) {
		case 'system':
		case 'user':
			return estimateTokens(msg.content) + 4; // Role overhead
		case 'assistant': {
			let tokens = 4; // Role overhead
			for (const part of msg.content) {
				switch (part.type) {
					case 'text':
						tokens += estimateTokens(part.text);
						break;
					case 'tool-call':
						tokens += estimateTokens(JSON.stringify(part.arguments)) + 20; // Tool call overhead
						break;
					case 'thinking':
						tokens += estimateTokens(part.text);
						break;
				}
			}
			return tokens;
		}
		case 'tool-result':
			return estimateTokens(msg.content) + 10; // Tool result overhead
	}
}

function estimateConversationTokens(messages: readonly IConversationMessage[]): number {
	return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// -- Middleware ----------------------------------------------------------------

export class ContextWindowMiddleware implements IMiddleware {
	private readonly _maxContextTokens: number;
	private readonly _compactionThreshold: number;
	private readonly _recentToolResultsToKeep: number;
	private readonly _prunedOutputMaxLength: number;

	constructor(config: IContextWindowConfig) {
		this._maxContextTokens = config.maxContextTokens;
		this._compactionThreshold = config.compactionThreshold ?? 0.8;
		this._recentToolResultsToKeep = config.recentToolResultsToKeep ?? 3;
		this._prunedOutputMaxLength = config.prunedOutputMaxLength ?? 200;
	}

	preRequest(context: IPreRequestContext): IPreRequestResult {
		const estimatedTokens = estimateConversationTokens(context.messages);
		const threshold = this._maxContextTokens * this._compactionThreshold;

		if (estimatedTokens <= threshold) {
			return { messages: context.messages, tools: context.tools };
		}

		// Phase 1: Prune old tool outputs
		const compacted = this._pruneToolOutputs(context.messages);
		return { messages: compacted, tools: context.tools };
	}

	/**
	 * Walk backwards through messages. The most recent
	 * {@link _recentToolResultsToKeep} tool results are kept verbatim.
	 * Older tool results are truncated to a short summary.
	 */
	private _pruneToolOutputs(messages: readonly IConversationMessage[]): IConversationMessage[] {
		const result = [...messages];
		let toolResultsSeen = 0;

		// Walk backwards to find tool results
		for (let i = result.length - 1; i >= 0; i--) {
			const msg = result[i];
			if (msg.role !== 'tool-result') {
				continue;
			}

			toolResultsSeen++;
			if (toolResultsSeen <= this._recentToolResultsToKeep) {
				continue; // Keep recent results verbatim
			}

			// Prune this tool result
			const maxLen = this._prunedOutputMaxLength;
			if (msg.content.length > maxLen) {
				const truncated = msg.content.substring(0, maxLen);
				const prunedMsg: IToolResultMessage = {
					...msg,
					content: `${truncated}\n[... output truncated for context management, ${msg.content.length - maxLen} characters removed]`,
				};
				result[i] = prunedMsg;
			}
		}

		return result;
	}
}
