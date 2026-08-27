/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderResponseMarkdown, truncateMiddle } from '../../../common/agentHostConversationContext.js';
import { type ActiveTurn, type Turn } from '../../../common/state/protocol/state.js';

const SIDE_CHAT_CONTEXT_START = '<side-chat-context>';
const SIDE_CHAT_CONTEXT_END = '</side-chat-context>';
const SIDE_CHAT_CONTEXT_LENGTH_PREFIX = 'length=';
const SIDE_CHAT_GUIDANCE = 'This is a side conversation. Prefer explanation over action; do not make changes or carry out work unless the user explicitly asks.';
const MAX_SIDE_CHAT_CONTEXT_CHARS = 20_000;

interface ISideChatBoundaryDescriptor {
	readonly inheritedTurnId?: string;
}

function buildSideChatSourceContext(turns: readonly Turn[], activeTurn?: ActiveTurn): string | undefined {
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

export function buildBoundedSideChatSourceContext(turns: readonly Turn[], turnId: string, activeTurn?: ActiveTurn, forkAnchorTurnId?: string): string | undefined {
	if (activeTurn?.id === turnId) {
		const anchorIndex = forkAnchorTurnId === undefined ? -1 : turns.findIndex(turn => turn.id === forkAnchorTurnId);
		return buildSideChatSourceContext(anchorIndex === -1 ? turns : turns.slice(anchorIndex + 1), activeTurn);
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

function parseSideChatSeed(text: string): string | undefined {
	if (!text.startsWith(SIDE_CHAT_CONTEXT_START)) {
		return undefined;
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
				return text.slice(contextEnd + SIDE_CHAT_CONTEXT_END.length + 1).trimStart();
			}
		}
	}
	const endIndex = text.lastIndexOf(SIDE_CHAT_CONTEXT_END);
	return endIndex < 0 ? undefined : text.slice(endIndex + SIDE_CHAT_CONTEXT_END.length).trimStart();
}

function stripSideChatContext(turns: readonly Turn[]): readonly Turn[] {
	if (turns.length === 0) {
		return turns;
	}
	const first = turns[0];
	const userPrompt = parseSideChatSeed(first.message.text);
	if (userPrompt === undefined) {
		return turns;
	}
	return [{ ...first, message: { ...first.message, text: userPrompt } }, ...turns.slice(1)];
}

/** Resolves the index of the first turn owned by a side chat. */
export function resolveSideChatBoundary(turns: readonly Turn[], sideChat: ISideChatBoundaryDescriptor | undefined): number {
	if (!sideChat) {
		return 0;
	}
	if (sideChat.inheritedTurnId !== undefined) {
		const inheritedIndex = turns.findIndex(turn => turn.id === sideChat.inheritedTurnId);
		if (inheritedIndex !== -1) {
			return inheritedIndex + 1;
		}
	}
	for (let i = turns.length - 1; i >= 0; i--) {
		if (parseSideChatSeed(turns[i].message.text) !== undefined) {
			return i;
		}
	}
	return turns.length;
}

/** Returns the turns owned by a side chat. */
export function sliceSideChatTurns(turns: readonly Turn[], sideChat: ISideChatBoundaryDescriptor | undefined): readonly Turn[] {
	if (!sideChat) {
		return turns;
	}

	return stripSideChatContext(turns.slice(resolveSideChatBoundary(turns, sideChat)));
}
