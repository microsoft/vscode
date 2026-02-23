/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { chatSessionResourceToId, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';

const $ = DOM.$;

export class ChatDebugHomeView extends Disposable {

	private readonly _onNavigateToSession = this._register(new Emitter<string>());
	readonly onNavigateToSession = this._onNavigateToSession.event;

	readonly container: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-home'));
	}

	show(): void {
		this.container.style.display = '';
		this.render();
	}

	hide(): void {
		this.container.style.display = 'none';
	}

	render(): void {
		DOM.clearNode(this.container);
		this.renderDisposables.clear();

		DOM.append(this.container, $('h2.chat-debug-home-title', undefined, localize('chatDebug.title', "Chat Debug Panel")));

		// Determine the active session ID
		const activeWidget = this.chatWidgetService.lastFocusedWidget;
		const activeSessionId = activeWidget?.viewModel?.sessionResource
			? chatSessionResourceToId(activeWidget.viewModel.sessionResource)
			: undefined;

		// List all known chat sessions (from chatService), most recent last → reversed for most recent first.
		// This does not require events to be collected, so the home view works
		// without any streaming pipelines being active.
		const sessionIds = [...this.chatService.chatModels.get()]
			.map(m => chatSessionResourceToId(m.sessionResource))
			.reverse();

		// Sort: active session first
		if (activeSessionId) {
			const activeIndex = sessionIds.indexOf(activeSessionId);
			if (activeIndex > 0) {
				sessionIds.splice(activeIndex, 1);
				sessionIds.unshift(activeSessionId);
			}
		}

		DOM.append(this.container, $('p.chat-debug-home-subtitle', undefined,
			sessionIds.length > 0
				? localize('chatDebug.homeSubtitle', "Select a chat session to debug")
				: localize('chatDebug.noSessions', "Send a chat message to get started")
		));

		if (sessionIds.length > 0) {
			const sessionList = DOM.append(this.container, $('.chat-debug-home-session-list'));

			for (const sessionId of sessionIds) {
				const sessionUri = LocalChatSessionUri.forSession(sessionId);
				const sessionTitle = this.chatService.getSessionTitle(sessionUri) || sessionId;
				const isActive = sessionId === activeSessionId;

				const item = DOM.append(sessionList, $<HTMLButtonElement>('button.chat-debug-home-session-item'));
				if (isActive) {
					item.classList.add('chat-debug-home-session-item-active');
				}

				DOM.append(item, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));

				const titleSpan = DOM.append(item, $('span.chat-debug-home-session-item-title'));
				const isShimmering = isUUID(sessionTitle);
				if (isShimmering) {
					titleSpan.classList.add('chat-debug-home-session-item-shimmer');
					item.disabled = true;
				} else {
					titleSpan.textContent = sessionTitle;
				}

				if (isActive) {
					DOM.append(item, $('span.chat-debug-home-session-badge', undefined, localize('chatDebug.active', "Active")));
				}

				if (!isShimmering) {
					this.renderDisposables.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, () => {
						this._onNavigateToSession.fire(sessionId);
					}));
				}
			}
		}
	}
}
