/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageAttachmentKind, ResponsePartKind, type MessageChatAttachment, type SimpleMessageAttachment, type Turn } from './protocol/state.js';

/**
 * Model-facing preamble that frames the resolved transcript for the SDK. It is
 * intentionally hard-coded English (like Claude's `<system-reminder>` text):
 * this string is consumed by the model, not shown in the UI, so it must not be
 * localized.
 */
const CHAT_TRANSCRIPT_PREAMBLE =
	'The user referenced another chat in the same session. ' +
	'The transcript below is that chat up to the selected turn, provided as background context. ' +
	'Treat it as reference material that may or may not be relevant to the new question.';

/**
 * Returns the referenced chat's turns bounded through {@link endTurn}, inclusive.
 * Throws when {@link endTurn} is not a retained completed turn.
 */
export function boundChatTranscriptTurns(turns: readonly Turn[], endTurn: string): readonly Turn[] {
	const index = turns.findIndex(t => t.id === endTurn);
	if (index < 0) {
		throw new Error(`Chat attachment endTurn ${endTurn} was not found in the retained transcript.`);
	}
	return turns.slice(0, index + 1);
}

/**
 * Formats bounded transcript turns into a plain-text conversation for the
 * model. Only user message text and assistant markdown are rendered; tool
 * calls, reasoning, and other parts are omitted to keep the context bounded.
 *
 * This never expands nested attachments, so a {@link MessageChatAttachment}
 * referenced inside the source transcript is not recursively resolved.
 */
export function formatChatTranscript(turns: readonly Turn[]): string {
	const blocks: string[] = [];
	for (const turn of turns) {
		const userText = turn.message?.text?.trim();
		if (userText) {
			blocks.push(`User: ${userText}`);
		}
		const assistantText = turn.responseParts
			.map(part => (part.kind === ResponsePartKind.Markdown ? part.content : ''))
			.join('')
			.trim();
		if (assistantText) {
			blocks.push(`Assistant: ${assistantText}`);
		}
	}
	return blocks.join('\n\n');
}

/**
 * Resolves a {@link MessageChatAttachment} into an SDK-compatible
 * {@link SimpleMessageAttachment}: the bounded transcript rendered as the
 * attachment's {@link SimpleMessageAttachment.modelRepresentation}. Every
 * provider adapter already inlines a `Simple` attachment's model
 * representation, so this keeps transcript formatting in one place instead of
 * duplicating it per agent.
 *
 * The resolution is non-recursive: it renders {@link sourceTurns} directly and
 * never re-resolves chat attachments found within them.
 */
export function resolveChatAttachment(attachment: MessageChatAttachment, sourceTurns: readonly Turn[]): SimpleMessageAttachment {
	const bounded = boundChatTranscriptTurns(sourceTurns, attachment.endTurn);
	const transcript = formatChatTranscript(bounded);
	const modelRepresentation = transcript
		? `${CHAT_TRANSCRIPT_PREAMBLE}\n\n${transcript}`
		: CHAT_TRANSCRIPT_PREAMBLE;
	return {
		type: MessageAttachmentKind.Simple,
		label: attachment.label,
		modelRepresentation,
		...(attachment.range !== undefined ? { range: attachment.range } : {}),
	};
}
