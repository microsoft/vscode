/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { CacheType } from '../../../platform/endpoint/common/endpointTypes';
import { CUSTOM_TOOL_SEARCH_NAME } from '../../../platform/networking/common/anthropic';
import { findLastIdx } from '../../../util/vs/base/common/arraysFind';

const MaxCacheBreakpoints = 4;
const MaxResponsesConversationCacheBreakpoints = 20;

/**
 * Chat Completions prompt cache breakpoint strategy (Responses uses its own bounded history below):
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
export function addCacheBreakpoints(messages: Raw.ChatMessage[], apiType: string | undefined) {
	if (apiType === 'responses') {
		addResponsesCacheBreakpoints(messages);
		return;
	}

	for (const message of messages) {
		if (!supportsCacheBreakpoint(message)) {
			message.content = message.content.filter(part => part.type !== Raw.ChatCompletionContentPartKind.CacheBreakpoint);
		}
	}

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
		if ((isBelowCurrentUserMessage && (isLastToolResultInRound || msg.role === Raw.ChatRole.User) || isAsstMsgWithNoTools) && supportsCacheBreakpoint(msg)) {
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
		if ((msg.role === Raw.ChatRole.User || msg.role === Raw.ChatRole.System) && !hasCacheBreakpoint && supportsCacheBreakpoint(msg)) {
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

/**
 * Reconstruct the latest 20 user/last-eligible-tool-result boundaries on every render,
 * plus anchors after the system instructions and the agent's leading global context.
 * The Responses serializer gates these markers on the model and explicit-caching flag.
 */
function addResponsesCacheBreakpoints(messages: Raw.ChatMessage[]): void {
	const toolSearchCallIds = new Set(messages.flatMap(message => message.role === Raw.ChatRole.Assistant
		? message.toolCalls?.filter(call => call.function.name === CUSTOM_TOOL_SEARCH_NAME).map(call => call.id) ?? []
		: []));
	const contentIndices = messages.map(message => {
		message.content = message.content.filter(part => part.type !== Raw.ChatCompletionContentPartKind.CacheBreakpoint);
		return findLastIdx(message.content, part => part.type === Raw.ChatCompletionContentPartKind.Text
			|| part.type === Raw.ChatCompletionContentPartKind.Image
			|| (part.type === Raw.ChatCompletionContentPartKind.Document && part.documentData.mediaType === 'application/pdf')
			|| isOpaqueBlockType(part, ['input_text', 'input_image', 'input_file']));
	});

	const prefixIndices = new Set<number>();
	let firstConversationIndex = 0;
	let leadingEnd = 0;
	while (messages[leadingEnd]?.role === Raw.ChatRole.System || messages[leadingEnd]?.role === Raw.ChatRole.User) {
		if (messages[leadingEnd].role === Raw.ChatRole.User) {
			firstConversationIndex = leadingEnd;
		}
		leadingEnd++;
	}
	// The final leading user message is the first query; preceding users contain
	// custom instructions and global context, not historical conversation turns.
	let lastSystemIndex: number | undefined;
	let lastContextIndex: number | undefined;
	for (let index = 0; index < leadingEnd; index++) {
		if (contentIndices[index] < 0) {
			continue;
		}
		if (messages[index].role === Raw.ChatRole.System) {
			lastSystemIndex = index;
		} else if (index < firstConversationIndex) {
			lastContextIndex = index;
		}
	}
	if (lastSystemIndex !== undefined) {
		prefixIndices.add(lastSystemIndex);
	}
	if (lastContextIndex !== undefined) {
		prefixIndices.add(lastContextIndex);
	}

	const conversationIndices: number[] = [];
	let toolBatchBoundary: number | undefined;
	for (const [index, message] of messages.entries()) {
		if (message.role === Raw.ChatRole.Tool) {
			if (message.toolCallId && !toolSearchCallIds.has(message.toolCallId) && contentIndices[index] >= 0) {
				toolBatchBoundary = index;
			}
		} else {
			if (toolBatchBoundary !== undefined) {
				conversationIndices.push(toolBatchBoundary);
				toolBatchBoundary = undefined;
			}
			if (message.role === Raw.ChatRole.User && index >= firstConversationIndex && contentIndices[index] >= 0) {
				conversationIndices.push(index);
			}
		}
	}
	if (toolBatchBoundary !== undefined) {
		conversationIndices.push(toolBatchBoundary);
	}

	for (const index of [...prefixIndices, ...conversationIndices.slice(-MaxResponsesConversationCacheBreakpoints)]) {
		messages[index].content.splice(contentIndices[index] + 1, 0, {
			type: Raw.ChatCompletionContentPartKind.CacheBreakpoint,
			cacheType: CacheType,
		});
	}
}

function supportsCacheBreakpoint(message: Raw.ChatMessage): boolean {
	return message.content.some(part => part.type === Raw.ChatCompletionContentPartKind.Text
		|| part.type === Raw.ChatCompletionContentPartKind.Image
		|| part.type === Raw.ChatCompletionContentPartKind.Document
		|| isOpaqueBlockType(part, ['text', 'image_url', 'input_audio', 'file', 'refusal']));
}

function isOpaqueBlockType(part: Raw.ChatCompletionContentPart, supportedTypes: readonly string[]): boolean {
	if (part.type !== Raw.ChatCompletionContentPartKind.Opaque || typeof part.value !== 'object' || part.value === null || !('type' in part.value)) {
		return false;
	}
	return supportedTypes.includes(String(part.value.type));
}

function countCacheBreakpoints(messages: Raw.ChatMessage[]) {
	let count = 0;
	for (const msg of messages) {
		count += msg.content.filter(part => part.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint).length;
	}
	return count;
}
