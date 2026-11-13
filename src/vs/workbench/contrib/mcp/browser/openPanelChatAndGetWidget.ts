/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { IChatWidget, IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';


export async function openPanelChatAndGetWidget(chatService: IChatWidgetService): Promise<IChatWidget | undefined> {
	const revealed = await chatService.revealChatView(false);
	// What replaces the Chat view returns the widget it shows, such as its active chat: not just any chat widget
	if (revealed && chatService.chatViewHostDelegate) {
		return revealed;
	}
	const widgets = chatService.getWidgetsByLocations(ChatAgentLocation.Chat);
	if (widgets.length) {
		return widgets[0];
	}

	const eventPromise = Event.toPromise(Event.filter(chatService.onDidAddWidget, e => e.location === ChatAgentLocation.Chat));

	return await raceTimeout(
		eventPromise,
		10000, // should be enough time for chat to initialize...
		() => eventPromise.cancel()
	);
}
