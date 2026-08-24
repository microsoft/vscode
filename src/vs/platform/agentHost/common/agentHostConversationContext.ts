/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResponsePartKind, type ResponsePart, type Turn } from './state/sessionState.js';

/**
 * Options for {@link buildConversationContext}.
 */
export interface IConversationContextOptions {
	/**
	 * Soft upper bound, in characters, for the conversation portion of the
	 * produced context string. When the conversation exceeds this budget its
	 * middle is removed (marked with `...`) via {@link truncateMiddle}. The
	 * optional {@link framing} is always preserved in full and does not count
	 * against this budget.
	 */
	readonly maxChars: number;

	/**
	 * Optional framing text prepended to the conversation (e.g. a note that the
	 * conversation was branched from an earlier chat). Always preserved in full
	 * — only the conversation is truncated to {@link maxChars}.
	 */
	readonly framing?: string;
}

/**
 * Concatenates the normal textual (markdown) response parts of a turn into a
 * single string. Tool calls, reasoning, content references, and other
 * non-markdown parts are intentionally ignored so that only the assistant's
 * user-facing prose is included — this keeps utility-model prompts focused and
 * free of large tool payloads or subagent traces.
 */
export function renderResponseMarkdown(parts: readonly ResponsePart[]): string {
	const segments: string[] = [];
	for (const part of parts) {
		if (part.kind === ResponsePartKind.Markdown) {
			const text = part.content.trim();
			if (text) {
				segments.push(text);
			}
		}
	}
	return segments.join('\n\n');
}

/**
 * Builds a plain-text conversation context string from the given turns by
 * concatenating each turn's user request and the assistant's textual
 * (markdown) response. Only normal text response parts are considered — tool
 * calls, reasoning, subagent traces, and other parts are ignored (see
 * {@link renderResponseMarkdown}). The conversation is middle-truncated to
 * {@link IConversationContextOptions.maxChars} to bound model cost; any
 * {@link IConversationContextOptions.framing} is prepended afterwards and is
 * always preserved in full.
 *
 * @returns the context string, or `undefined` when no turn carries any text
 * worth including.
 */
export function buildConversationContext(turns: readonly Turn[], options: IConversationContextOptions): string | undefined {
	const blocks: string[] = [];
	for (const turn of turns) {
		const userText = turn.message.text.trim();
		const responseText = renderResponseMarkdown(turn.responseParts);
		if (!userText && !responseText) {
			continue;
		}
		blocks.push(responseText
			? `User request:\n${userText}\n\nAgent response:\n${responseText}`
			: `User request:\n${userText}`);
	}
	if (blocks.length === 0) {
		return undefined;
	}
	const conversation = blocks.join('\n\n---\n\n');
	const truncatedConversation = conversation.length > options.maxChars ? truncateMiddle(conversation, options.maxChars) : conversation;
	return `${options.framing ?? ''}${truncatedConversation}`;
}

/**
 * Truncates `text` to at most `maxChars` characters by removing the middle and
 * inserting a `...` marker, preserving the start and end.
 */
export function truncateMiddle(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	const marker = '\n...\n';
	if (maxChars <= marker.length) {
		return text.slice(0, maxChars);
	}
	const keep = maxChars - marker.length;
	const head = Math.ceil(keep / 2);
	const tail = keep - head;
	return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}
