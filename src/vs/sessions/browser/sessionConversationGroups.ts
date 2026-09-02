/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../base/common/hash.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { ChatOriginKind, IChat, SessionStatus } from '../services/sessions/common/session.js';

export const SESSION_CONVERSATION_SIDE_CHATS_GROUP = '1_sidechats';

export function getSessionConversationActionId(sessionId: string, chatResource: URI): string {
	return `sessions.openChat.${sessionId}.${hash(chatResource.toString())}`;
}

export function getSessionConversationStatusLabel(status: SessionStatus): string {
	switch (status) {
		case SessionStatus.Untitled:
			return localize('sessionConversationStatus.new', "New");
		case SessionStatus.InProgress:
			return localize('sessionConversationStatus.inProgress', "In Progress");
		case SessionStatus.NeedsInput:
			return localize('sessionConversationStatus.needsInput', "Input Needed");
		case SessionStatus.Completed:
			return localize('sessionConversationStatus.completed', "Completed");
		case SessionStatus.Error:
			return localize('sessionConversationStatus.failed', "Failed");
	}
}

export function getSessionConversationStatusAriaLabel(status: SessionStatus): string {
	return localize('sessionConversationStatus.ariaLabel', "State: {0}", getSessionConversationStatusLabel(status));
}

/** Whether a chat belongs in the Side Chats menu. */
export function isSessionConversationSideChat(chat: IChat): boolean {
	return chat.origin?.kind === ChatOriginKind.SideChat;
}
