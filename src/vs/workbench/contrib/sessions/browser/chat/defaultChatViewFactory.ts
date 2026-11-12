/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SessionsChatBackgroundReplica } from '../chatBackgroundRenderer.js';
import { ISessionsChatBackgroundService } from '../chatBackgroundService.js';
import { IChatViewOptions } from '../parts/chatView.js';
import { SESSIONS_CHAT_SURFACE_CLASS, SessionsChatSurface } from '../sessionsChatSurface.js';
import { ChatViewFactory } from './chatView.js';

export class DefaultChatViewFactory extends ChatViewFactory {

	protected override readonly viewOptions: IChatViewOptions;

	constructor(
		@ISessionsChatBackgroundService backgroundService: ISessionsChatBackgroundService,
	) {
		super();
		this.viewOptions = {
			background: {
				onDidChange: backgroundService.onDidChangeBackground,
				hasBackground: () => !!backgroundService.getBackground(),
				createReplica: (chatElement, container) => {
					const surface = chatElement.closest(`.${SESSIONS_CHAT_SURFACE_CLASS}`);
					const source = surface ? Array.from(surface.children).find(element => element.classList.contains('sessions-chat-background')) : undefined;
					if (!isHTMLElement(source)) {
						return undefined;
					}
					const replica = new SessionsChatBackgroundReplica(source, container);
					return {
						updateBackground: () => replica.setBackground(backgroundService.getBackground()),
						layout: () => replica.layout(),
						dispose: () => replica.dispose(),
					};
				},
			},
		};
	}

	createChatBackground(container: HTMLElement, instantiationService: IInstantiationService): IDisposable {
		return instantiationService.createInstance(SessionsChatSurface, container);
	}
}
