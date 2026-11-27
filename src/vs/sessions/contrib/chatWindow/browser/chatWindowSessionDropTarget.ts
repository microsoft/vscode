/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, getWindowId } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { SessionChatDropTarget } from '../../../../workbench/contrib/sessions/browser/parts/sessionChatDropTarget.js';

/**
 * Makes the chat of a chat window take the chats and sessions dragged onto it, such as a session of the sessions list or
 * the tab of a chat of the main window: it opens each in the chat window, as a tab beside the chat (see
 * {@link SessionChatDropTarget}).
 */
export class ChatWindowSessionDropTarget extends Disposable {

	/**
	 * @param element The chat's element, which positions the overlay.
	 * @param getChat The chat the element shows, which the dropped chats open beside.
	 */
	constructor(
		element: HTMLElement,
		getChat: () => URI | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatWindowService chatWindowService: IChatWindowService,
	) {
		super();

		this._register(instantiationService.createInstance(SessionChatDropTarget, element, {
			chat: getChat,
			open: chats => {
				const window = chatWindowService.getWindow(getWindowId(getWindow(element)));
				if (!window) {
					return;
				}
				void (async () => {
					let tabOf = getChat();
					for (const resource of chats) {
						await chatWindowService.open(resource, { window, exactChat: true, tabOf });
						tabOf = resource;
					}
				})().catch(onUnexpectedError);
			},
		}));
	}
}
