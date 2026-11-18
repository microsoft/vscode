/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IOffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { type MessageChatAttachment, type TextRange } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { createChatReferenceVariableEntry, type IChatRequestChatReferenceVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

/**
 * Restore a first-class {@link IChatRequestChatReferenceVariableEntry chat-reference entry}
 * from a stored {@link MessageChatAttachment} when replaying a past request from
 * agent-host state.
 *
 * The stored attachment carries the opaque **backend** chat URI, and entries now
 * hold that exact URI, so restore is pure identity: {@link MessageChatAttachment.resource}
 * becomes the entry's `value` verbatim. The client-side chat is resolved lazily
 * (only when the reference chip is clicked), so a chat that was never opened in
 * this window still restores to a working reference and re-sends identically.
 *
 * @param attachment The stored chat attachment to restore.
 * @param messageText The `Message.text` the attachment references, used to map the
 * attachment's stored {@link TextRange} back to the entry's prompt {@link IOffsetRange}
 * so the inline `#chat:` highlight survives a draft round-trip. When omitted (e.g. a
 * completed history request that is only displayed) the entry is restored without a range.
 */
export function restoreChatReferenceVariableEntryFromAttachment(attachment: MessageChatAttachment, messageText?: string): IChatRequestChatReferenceVariableEntry {
	const range = messageText !== undefined ? textRangeToOffsetRange(messageText, attachment.range) : undefined;
	return createChatReferenceVariableEntry(URI.parse(attachment.resource), attachment.endTurn, attachment.label, attachment._meta, range);
}

/**
 * Convert a stored {@link TextRange} (zero-based line/character positions into
 * `messageText`) back into the entry's prompt {@link IOffsetRange}. This is the
 * inverse of the outgoing offset→{@link TextRange} conversion, so a typed reference
 * survives a draft round-trip with its highlight span intact. Returns `undefined`
 * when there is no range or the positions fall outside `messageText`.
 */
function textRangeToOffsetRange(messageText: string, range: TextRange | undefined): IOffsetRange | undefined {
	if (!range) {
		return undefined;
	}
	const start = positionToOffset(messageText, range.start.line, range.start.character);
	const endExclusive = positionToOffset(messageText, range.end.line, range.end.character);
	if (start < 0 || endExclusive > messageText.length || start > endExclusive) {
		return undefined;
	}
	return { start, endExclusive };
}

/**
 * Map a zero-based `line`/`character` position to an absolute offset into `text`,
 * clamping to the end of the text when the position runs past it.
 */
function positionToOffset(text: string, line: number, character: number): number {
	let offset = 0;
	for (let currentLine = 0; currentLine < line; currentLine++) {
		const newline = text.indexOf('\n', offset);
		if (newline === -1) {
			return text.length;
		}
		offset = newline + 1;
	}
	return Math.min(offset + Math.max(0, character), text.length);
}
