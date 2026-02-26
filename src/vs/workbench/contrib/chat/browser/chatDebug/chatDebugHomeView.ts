/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';

const $ = DOM.$;

export class ChatDebugHomeView extends Disposable {

	private readonly _onNavigateToSession = this._register(new Emitter<URI>());
	readonly onNavigateToSession = this._onNavigateToSession.event;

	readonly container: HTMLElement;
	private readonly scrollContent: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-home'));
		this.scrollContent = DOM.append(this.container, $('div.chat-debug-home-content'));
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

		DOM.append(this.scrollContent, $('h2.chat-debug-home-title', undefined, localize('chatDebug.title', "Agent Debug Panel")));

		// Determine the active session resource
		const activeWidget = this.chatWidgetService.lastFocusedWidget;
		const activeSessionResource = activeWidget?.viewModel?.sessionResource;

		// List sessions that have debug event data.
		// Use the debug service as the source of truth — it includes sessions
		// whose chat models may have been archived (e.g. when a new chat was started).
		const sessionResources = [...this.chatDebugService.getSessionResources()].reverse();

		// Sort: active session first
		if (activeSessionResource) {
			const activeIndex = sessionResources.findIndex(r => r.toString() === activeSessionResource.toString());
			if (activeIndex > 0) {
				sessionResources.splice(activeIndex, 1);
				sessionResources.unshift(activeSessionResource);
			}
		}

		DOM.append(this.scrollContent, $('p.chat-debug-home-subtitle', undefined,
			sessionResources.length > 0
				? localize('chatDebug.homeSubtitle', "Select a chat session to debug")
				: localize('chatDebug.noSessions', "Send a chat message to get started")
		));

		if (sessionResources.length > 0) {
			const sessionList = DOM.append(this.scrollContent, $('.chat-debug-home-session-list'));
			sessionList.setAttribute('role', 'list');
			sessionList.setAttribute('aria-label', localize('chatDebug.sessionList', "Chat sessions"));

			const items: HTMLButtonElement[] = [];

			for (const sessionResource of sessionResources) {
				const sessionTitle = this.chatService.getSessionTitle(sessionResource) || LocalChatSessionUri.parseLocalSessionId(sessionResource) || sessionResource.toString();
				const isActive = activeSessionResource !== undefined && sessionResource.toString() === activeSessionResource.toString();

				const item = DOM.append(sessionList, $<HTMLButtonElement>('button.chat-debug-home-session-item'));
				item.setAttribute('role', 'listitem');
				if (isActive) {
					item.classList.add('chat-debug-home-session-item-active');
					item.setAttribute('aria-current', 'true');
				}

				DOM.append(item, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));

				const titleSpan = DOM.append(item, $('span.chat-debug-home-session-item-title'));
				// Only show shimmer when the title is a UUID AND the model is not
				// yet loaded. A live session with no requests yet has an empty title but its model exists — show a
				// placeholder instead of an indefinite spinner.
				const hasLiveModel = !!this.chatService.getSession(sessionResource);
				const isShimmering = isUUID(sessionTitle) && !hasLiveModel;
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
						this._onNavigateToSession.fire(sessionResource);
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
	}
}
