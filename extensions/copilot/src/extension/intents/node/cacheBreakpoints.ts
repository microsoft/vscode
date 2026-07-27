/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { CacheType } from '../../../platform/endpoint/common/endpointTypes';

const MaxCacheBreakpoints = 4;

/**
 * Prompt cache breakpoint strategy:
 *
 * The prompt is structured like
 * - System message
 * - Custom instructions
 * - Global context message (has prompt-tsx cache breakpoint)
 * - History
 * - Current user message with extra context
 * - Current tool call rounds
 *
 * Below the current user message, we add cache breakpoints to the last tool result in each round.
 * We add one to the current user message.
 * And above the current user message, we add breakpoionts to an assistant message with no tool calls (so the terminal response in a turn).
 *
 * There will always be a cache miss when a new turn starts because the previous messages move from below the current user message with extra context to above it.
 * For turns with no tool calling, we will have a hit on the previous assistant message in history.
 * During the agentic loop, each request will have a hit on the previous tool result message.
 */
export function addCacheBreakpoints(messages: Raw.ChatMessage[]) {
	// One or two cache breakpoints are already added via the prompt, assign the rest here.
	let count = MaxCacheBreakpoints - countCacheBreakpoints(messages);
	let isBelowCurrentUserMessage = true;
	const reversedMsgs = [...messages].reverse();
	for (const [idx, msg] of reversedMsgs.entries()) {
		const prevMsg = reversedMsgs.at(idx - 1);
		const hasCacheBreakpoint = msg.content.some(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint);
		if (hasCacheBreakpoint) {
			continue;
		}

		const isLastToolResultInRound = msg.role === Raw.ChatRole.Tool && prevMsg?.role !== Raw.ChatRole.Tool;
		const isAsstMsgWithNoTools = msg.role === Raw.ChatRole.Assistant && !msg.toolCalls?.length;
		if (isBelowCurrentUserMessage && (isLastToolResultInRound || msg.role === Raw.ChatRole.User) || isAsstMsgWithNoTools) {
			count--;
			msg.content.push({
				type: Raw.ChatCompletionContentPartKind.CacheBreakpoint,
				cacheType: CacheType
			});

			if (count <= 0) {
				break;
			}
		}

		if (msg.role === Raw.ChatRole.User) {
			isBelowCurrentUserMessage = false;
		}
	}

	// If we still have cache breakpoints to allocate, add them from the system and custom instructions messages, if applicable.
	for (const msg of messages) {
		if (count <= 0) {
			break;
		}

		const hasCacheBreakpoint = msg.content.some(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint);
		if ((msg.role === Raw.ChatRole.User || msg.role === Raw.ChatRole.System) && !hasCacheBreakpoint) {
			count--;
			msg.content.push({
				type: Raw.ChatCompletionContentPartKind.CacheBreakpoint,
				cacheType: CacheType
			});
		}

		if (msg.role !== Raw.ChatRole.User && msg.role !== Raw.ChatRole.System) {
			break;
		}
	}
}

function countCacheBreakpoints(messages: Raw.ChatMessage[]) {
	let count = 0;
	for (const msg of messages) {
		count += msg.content.filter(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint).length;
	}
	return count;
}
