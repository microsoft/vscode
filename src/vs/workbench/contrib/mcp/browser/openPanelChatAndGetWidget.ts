/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../chat/browser/chat.js';
import { IChatViewHostService } from '../../chat/browser/chatViewHost.js';

/**
 * Shows the host of the Chat view's chats, the Chat view or what replaces it, and resolves to the widget of the chat it
 * shows, once it has one: not just any chat widget, such as one of a chat editor.
 */
export function openPanelChatAndGetWidget(chatViewHostService: IChatViewHostService): Promise<IChatWidget | undefined> {
	return chatViewHostService.reveal(false, { waitForWidget: true });
}
