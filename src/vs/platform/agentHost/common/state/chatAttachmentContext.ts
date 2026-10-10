/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageAttachmentKind, ResponsePartKind, type MessageChatAttachment, type SimpleMessageAttachment, type Turn } from './protocol/state.js';
import { SessionServerToolName } from '../serverToolNames.js';

/**
 * Maximum number of characters of the bounded transcript inlined as a tail
 * excerpt in a chat attachment's model representation. The transcript itself is
 * unbounded, so instead of inlining it whole we point the model at the source
 * chat (via an open link + the `get_session_context` tool) and only include the
 * most recent slice as a taste of the content.
 */
export const MAX_CHAT_ATTACHMENT_EXCERPT_CHARS = 1000;

/**
 * Returns the referenced chat's turns bounded through {@link endTurn}, inclusive.
 *
 * When {@link endTurn} is omitted, every turn is returned (the caller lets the
 * host pin the latest turn implicitly). When {@link endTurn} is provided but is
 * not a retained turn, this throws.
 */
export function boundChatTranscriptTurns(turns: readonly Turn[], endTurn?: string): readonly Turn[] {
	if (endTurn === undefined) {
		return turns;
	}
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
 * Keeps the last {@link maxChars} characters of {@link text}, dropping the
 * front. Unlike the middle-truncation used for side-chat context (which
 * preserves both ends), this keeps only the tail so the most recent transcript
 * content survives.
 */
function truncateFront(text: string, maxChars: number): string {
	return text.length <= maxChars ? text : text.slice(text.length - maxChars);
}

/**
 * Builds the model-facing pointer for a chat attachment: it names the
 * referenced chat, gives an {@link openLink} that identifies it, inlines a short
 * tail excerpt of the bounded transcript, and tells the model it can call the
 * `get_session_context` server tool with that link to read the full transcript.
 *
 * {@link openLink} is `undefined` when the referenced chat's resource cannot be
 * mapped to an open-session link. The pointer then identifies the chat by its
 * raw resource and omits the tool hint (the tool addresses chats by link), so a
 * malformed reference still carries its excerpt instead of failing the turn.
 *
 * The text is intentionally hard-coded English (like Claude's
 * `<system-reminder>` text): it is consumed by the model, not shown in the UI,
 * so it must not be localized.
 */
function buildChatAttachmentPointer(label: string, resource: string, openLink: string | undefined, transcript: string): string {
	const intro = openLink
		? `The user referenced another chat, "${label}". ` +
		`That chat is identified by the link ${openLink}. ` +
		`To read its full transcript, call the ${SessionServerToolName.GetSessionContext} server tool with its "session" argument set to that link.`
		: `The user referenced another chat, "${label}", identified by ${resource}.`;

	if (!transcript) {
		return `${intro}\n\nThe referenced chat has no transcript content up to the selected turn.`;
	}

	if (transcript.length > MAX_CHAT_ATTACHMENT_EXCERPT_CHARS) {
		const excerpt = truncateFront(transcript, MAX_CHAT_ATTACHMENT_EXCERPT_CHARS);
		return `${intro}\n\nThe excerpt below is only the tail end of that transcript up to the selected turn (about the last ${MAX_CHAT_ATTACHMENT_EXCERPT_CHARS} characters; the earlier part was omitted to keep the most recent content):\n\n${excerpt}`;
	}

	return `${intro}\n\nThe excerpt below is that chat's full transcript up to the selected turn:\n\n${transcript}`;
}

/**
 * Resolves a {@link MessageChatAttachment} into an SDK-compatible
 * {@link SimpleMessageAttachment}: a pointer to the referenced chat carried as
 * the attachment's {@link SimpleMessageAttachment.modelRepresentation}. Every
 * provider adapter already inlines a `Simple` attachment's model
 * representation, so this keeps the framing in one place instead of duplicating
 * it per agent.
 *
 * Rather than inlining the (unbounded) transcript, the representation names the
 * chat ({@link MessageChatAttachment.label}), gives {@link openLink} — an
 * `agent-host-session://` link that identifies the referenced chat — inlines a
 * short tail excerpt of the bounded transcript, and points the model at the
 * `get_session_context` server tool to read the rest.
 *
 * The resolution is non-recursive: it renders {@link sourceTurns} directly and
 * never re-resolves chat attachments found within them.
 */
export function resolveChatAttachment(attachment: MessageChatAttachment, sourceTurns: readonly Turn[], openLink: string | undefined): SimpleMessageAttachment {
	const bounded = boundChatTranscriptTurns(sourceTurns, attachment.endTurn);
	const transcript = formatChatTranscript(bounded);
	const modelRepresentation = buildChatAttachmentPointer(attachment.label, attachment.resource.toString(), openLink, transcript);
	return {
		type: MessageAttachmentKind.Simple,
		label: attachment.label,
		modelRepresentation,
		...(attachment.range !== undefined ? { range: attachment.range } : {}),
	};
}
