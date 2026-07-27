/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { type MessageChatAttachment } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { createChatReferenceVariableEntry, type IChatRequestChatReferenceVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

/**
 * Restore a first-class {@link IChatRequestChatReferenceVariableEntry chat-reference entry}
 * from a stored {@link MessageChatAttachment} when replaying a past request from
 * agent-host state. Returns `undefined` when the attachment resource cannot be parsed.
 *
 * @param attachment The stored chat attachment to restore.
 */
export function restoreChatReferenceVariableEntryFromAttachment(attachment: MessageChatAttachment): IChatRequestChatReferenceVariableEntry | undefined {
	let chatResource: URI;
	try {
		chatResource = URI.parse(attachment.resource);
	} catch {
		return undefined;
	}
	return createChatReferenceVariableEntry(chatResource, attachment.endTurn, attachment.label, attachment._meta);
}
