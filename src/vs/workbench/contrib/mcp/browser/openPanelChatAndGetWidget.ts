/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../../chat/browser/chat.js';
import { IChatViewHostService } from '../../chat/browser/chatViewHost.js';

/**
 * Shows the host of the Chat view's chats, the Chat view or what replaces it, and resolves to the widget of the chat it
 * shows: not just any chat widget, such as one of a chat editor. A host that replaces the Chat view answers itself, also
 * with none; the Chat view's widget is waited for while the view has none yet.
 */
export async function openPanelChatAndGetWidget(chatViewHostService: IChatViewHostService, chatService: IChatWidgetService): Promise<IChatWidget | undefined> {
	// Read as the reveal starts, which is when the reveal picks its host
	const replaced = chatViewHostService.isReplaced;
	const revealed = await chatService.revealChatView(false);
	if (revealed || replaced) {
		return revealed;
	}

	const eventPromise = Event.toPromise(Event.filter(chatService.onDidAddWidget, widget => isIChatViewViewContext(widget.viewContext)));

	return await raceTimeout(
		eventPromise,
		10000, // should be enough time for chat to initialize...
		() => eventPromise.cancel()
	);
}
