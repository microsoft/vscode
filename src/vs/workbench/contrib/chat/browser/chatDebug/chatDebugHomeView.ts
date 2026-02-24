/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { chatSessionResourceToId, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';

const $ = DOM.$;

export class ChatDebugHomeView extends Disposable {

	private readonly _onNavigateToSession = this._register(new Emitter<string>());
	readonly onNavigateToSession = this._onNavigateToSession.event;

	readonly container: HTMLElement;
	private readonly scrollContent: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-home'));
		this.scrollContent = $('div.chat-debug-home-content');
		this.scrollable = this._register(new DomScrollableElement(this.scrollContent, {}));
		DOM.append(this.container, this.scrollable.getDomNode());
	}

	show(): void {
		this.container.style.display = '';
		this.render();
	}

	hide(): void {
		this.container.style.display = 'none';
	}

	render(): void {
		DOM.clearNode(this.scrollContent);
		this.renderDisposables.clear();

		DOM.append(this.scrollContent, $('h2.chat-debug-home-title', undefined, localize('chatDebug.title', "Chat Debug Panel")));

		// Determine the active session ID
		const activeWidget = this.chatWidgetService.lastFocusedWidget;
		const activeSessionId = activeWidget?.viewModel?.sessionResource
			? chatSessionResourceToId(activeWidget.viewModel.sessionResource)
			: undefined;

		// List all known chat sessions (from chatService), most recent last → reversed for most recent first.
		// This does not require events to be collected, so the home view works
		// without any streaming pipelines being active.
		const sessionIdsWithEvents = new Set(this.chatDebugService.getSessionIds());
		const sessionIds = [...this.chatService.chatModels.get()]
			.map(m => chatSessionResourceToId(m.sessionResource))
			.filter(id => sessionIdsWithEvents.has(id))
			.reverse();

		// Sort: active session first
		if (activeSessionId) {
			const activeIndex = sessionIds.indexOf(activeSessionId);
			if (activeIndex > 0) {
				sessionIds.splice(activeIndex, 1);
				sessionIds.unshift(activeSessionId);
			}
		}

		DOM.append(this.scrollContent, $('p.chat-debug-home-subtitle', undefined,
			sessionIds.length > 0
				? localize('chatDebug.homeSubtitle', "Select a chat session to debug")
				: localize('chatDebug.noSessions', "Send a chat message to get started")
		));

		if (sessionIds.length > 0) {
			const sessionList = DOM.append(this.scrollContent, $('.chat-debug-home-session-list'));
			sessionList.setAttribute('role', 'list');
			sessionList.setAttribute('aria-label', localize('chatDebug.sessionList', "Chat sessions"));

			const items: HTMLButtonElement[] = [];

			for (const sessionId of sessionIds) {
				const sessionUri = LocalChatSessionUri.forSession(sessionId);
				const sessionTitle = this.chatService.getSessionTitle(sessionUri) || sessionId;
				const isActive = sessionId === activeSessionId;

				const item = DOM.append(sessionList, $<HTMLButtonElement>('button.chat-debug-home-session-item'));
				item.setAttribute('role', 'listitem');
				if (isActive) {
					item.classList.add('chat-debug-home-session-item-active');
					item.setAttribute('aria-current', 'true');
				}

				DOM.append(item, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));

				const titleSpan = DOM.append(item, $('span.chat-debug-home-session-item-title'));
				const isShimmering = isUUID(sessionTitle);
				if (isShimmering) {
					titleSpan.classList.add('chat-debug-home-session-item-shimmer');
					item.disabled = true;
					item.setAttribute('aria-busy', 'true');
					item.setAttribute('aria-label', localize('chatDebug.loadingSession', "Loading session…"));
				} else {
					titleSpan.textContent = sessionTitle;
					const ariaLabel = isActive
						? localize('chatDebug.sessionItemActive', "{0} (active)", sessionTitle)
						: sessionTitle;
					item.setAttribute('aria-label', ariaLabel);
				}

				if (isActive) {
					DOM.append(item, $('span.chat-debug-home-session-badge', undefined, localize('chatDebug.active', "Active")));
				}

				if (!isShimmering) {
					this.renderDisposables.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, () => {
						this._onNavigateToSession.fire(sessionId);
					}));
					items.push(item);
				}
			}

			// Arrow key navigation between session items
			this.renderDisposables.add(DOM.addDisposableListener(sessionList, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (items.length === 0) {
					return;
				}
				const focused = DOM.getActiveElement() as HTMLElement;
				const idx = items.indexOf(focused as HTMLButtonElement);
				if (idx === -1) {
					return;
				}
				let nextIdx: number | undefined;
				switch (e.key) {
					case 'ArrowDown':
						nextIdx = idx + 1 < items.length ? idx + 1 : idx;
						break;
					case 'ArrowUp':
						nextIdx = idx - 1 >= 0 ? idx - 1 : idx;
						break;
					case 'Home':
						nextIdx = 0;
						break;
					case 'End':
						nextIdx = items.length - 1;
						break;
				}
				if (nextIdx !== undefined) {
					e.preventDefault();
					items[nextIdx].focus();
				}
			}));
		}

		this.scrollable.scanDomNode();
	}
}
