/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { isUUID } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from '../../common/promptSyntax/promptTypes.js';
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { IChatWidgetService } from '../chat.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';

const $ = DOM.$;

const PAGE_SIZE = 5;

export class ChatDebugHomeView extends Disposable {

	private readonly _onNavigateToSession = this._register(new Emitter<URI>());
	readonly onNavigateToSession = this._onNavigateToSession.event;

	readonly container: HTMLElement;
	private readonly scrollContent: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	/** Number of sessions currently visible (grows on "Show More"). */
	private _visibleCount = PAGE_SIZE;

	/** Session resource that the user last navigated to from the home view. */
	private _lastOpenedSessionResource: URI | undefined;

	/** Tracks the number of known sessions so we can detect new ones. */
	private _lastKnownSessionCount = 0;

	constructor(
		parent: HTMLElement,
		@IChatService private readonly chatService: IChatService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super();
		this.container = DOM.append(parent, $('.chat-debug-home'));
		this.scrollContent = DOM.append(this.container, $('div.chat-debug-home-content'));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING)) {
				this.render();
			}
		}));

		// Re-render when a new session appears so it surfaces at the top.
		this._register(this.chatDebugService.onDidAddEvent(e => {
			const currentCount = this.chatDebugService.getSessionResources().length;
			if (currentCount !== this._lastKnownSessionCount) {
				this._lastKnownSessionCount = currentCount;
				if (this.container.style.display !== 'none') {
					this.render();
				}
			}
		}));

		// Re-render when historical sessions are discovered from disk.
		this._register(this.chatDebugService.onDidChangeAvailableSessionResources(() => {
			if (this.container.style.display !== 'none') {
				this.render();
			}
		}));
	}

	show(): void {
		this.container.style.display = '';
		this.render();
	}

	hide(): void {
		this.container.style.display = 'none';
	}

	render(): void {
		const isFileLoggingEnabled = this.configurationService.getValue<boolean>(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
		this._lastKnownSessionCount = this.chatDebugService.getSessionResources().length;

		const sessionResources = isFileLoggingEnabled
			? this._getFilteredSessionResources(this.chatDebugService.getAvailableSessionResources())
			: [];
		this._renderWithSessions(sessionResources);
	}

	private _getFilteredSessionResources(resources: readonly URI[]): URI[] {
		const cliSessionTypes = new Set(['copilotcli', 'claude-code']);
		return [...resources]
			.filter(r => !cliSessionTypes.has(getChatSessionType(r)) || !isUntitledChatSession(r));
	}

	private _renderWithSessions(sessionResources: URI[]): void {
		DOM.clearNode(this.scrollContent);
		this.renderDisposables.clear();

		DOM.append(this.scrollContent, $('h2.chat-debug-home-title', undefined, localize('chatDebug.title', "Agent Debug Logs")));

		const isEnabled = this.configurationService.getValue<boolean>(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
		if (!isEnabled) {
			DOM.append(this.scrollContent, $('p.chat-debug-home-subtitle', undefined,
				localize('chatDebug.disabled', "Enable to view debug logs and investigate chat issues with /troubleshoot.")
			));

			const enableButton = this.renderDisposables.add(new Button(this.scrollContent, { ...defaultButtonStyles, secondary: true }));
			enableButton.element.style.width = 'auto';
			enableButton.label = localize('chatDebug.openSetting', "Enable in Settings");
			this.renderDisposables.add(enableButton.onDidClick(() => {
				this.preferencesService.openSettings({ jsonEditor: false, query: `@id:${AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING}` });
			}));
			return;
		}

		// Determine the active session resource
		const activeWidget = this.chatWidgetService.lastFocusedWidget;
		const activeSessionResource = activeWidget?.viewModel?.sessionResource;

		// Bubble active sessions to top
		const bubbleToTop = (resource: URI | undefined) => {
			if (!resource) {
				return;
			}
			const idx = sessionResources.findIndex(r => r.toString() === resource.toString());
			if (idx > 0) {
				sessionResources.splice(idx, 1);
				sessionResources.unshift(resource);
			}
		};
		bubbleToTop(this._lastOpenedSessionResource);
		bubbleToTop(activeSessionResource);

		DOM.append(this.scrollContent, $('p.chat-debug-home-subtitle', undefined,
			sessionResources.length > 0
				? localize('chatDebug.homeSubtitle', "Select a chat session to debug")
				: localize('chatDebug.noSessions', "Send a chat message to get started")
		));

		if (sessionResources.length > 0) {
			const visibleSessions = sessionResources.slice(0, this._visibleCount);

			const sessionList = DOM.append(this.scrollContent, $('.chat-debug-home-session-list'));
			sessionList.setAttribute('role', 'list');
			sessionList.setAttribute('aria-label', localize('chatDebug.sessionList', "Chat sessions"));

			const items: HTMLButtonElement[] = [];

			for (const sessionResource of visibleSessions) {
				// Resolve title: agent sessions model (same as sidebar) → chat service → historical from JSONL → fallback
				const agentSession = this.agentSessionsService.model.getSession(sessionResource);
				const rawTitle = agentSession?.label ?? this.chatService.getSessionTitle(sessionResource);
				const importedTitle = this.chatDebugService.getImportedSessionTitle(sessionResource);
				const historicalTitle = this.chatDebugService.getHistoricalSessionTitle(sessionResource);
				let sessionTitle: string;
				if (rawTitle && !isUUID(rawTitle)) {
					sessionTitle = rawTitle;
				} else if (historicalTitle) {
					sessionTitle = historicalTitle;
				} else if (importedTitle) {
					sessionTitle = localize('chatDebug.importedSession', "Imported: {0}", importedTitle);
				} else if (LocalChatSessionUri.isLocalSession(sessionResource)) {
					sessionTitle = localize('chatDebug.newSession', "New Chat");
				} else if (getChatSessionType(sessionResource) === 'copilotcli') {
					const pathId = sessionResource.path.replace(/^\//, '').split('-')[0];
					const shortId = pathId || sessionResource.authority || sessionResource.toString();
					sessionTitle = localize('chatDebug.copilotCliSessionWithId', "Copilot CLI: {0}", shortId);
				} else if (getChatSessionType(sessionResource) === 'claude-code') {
					const pathId = sessionResource.path.replace(/^\//, '').split('-')[0];
					const shortId = pathId || sessionResource.authority || sessionResource.toString();
					sessionTitle = localize('chatDebug.claudeCodeSessionWithId', "Claude Code: {0}", shortId);
				} else {
					sessionTitle = localize('chatDebug.newSession', "New Chat");
				}
				const isActive = activeSessionResource !== undefined && sessionResource.toString() === activeSessionResource.toString();

				const item = DOM.append(sessionList, $<HTMLButtonElement>('button.chat-debug-home-session-item'));
				item.setAttribute('role', 'listitem');
				if (isActive) {
					item.classList.add('chat-debug-home-session-item-active');
					item.setAttribute('aria-current', 'true');
				}

				DOM.append(item, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));

				const titleSpan = DOM.append(item, $('span.chat-debug-home-session-item-title'));
				titleSpan.textContent = sessionTitle;
				const ariaLabel = isActive
					? localize('chatDebug.sessionItemActive', "{0} (active)", sessionTitle)
					: sessionTitle;
				item.setAttribute('aria-label', ariaLabel);

				if (isActive) {
					DOM.append(item, $('span.chat-debug-home-session-badge', undefined, localize('chatDebug.active', "Active")));
				}

				this.renderDisposables.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, () => {
					this._lastOpenedSessionResource = sessionResource;
					this._onNavigateToSession.fire(sessionResource);
				}));
				items.push(item);
			}

			// "Show More" button when there are more sessions to display
			if (sessionResources.length > this._visibleCount) {
				const remaining = sessionResources.length - this._visibleCount;
				const showMoreButton = this.renderDisposables.add(new Button(this.scrollContent, { ...defaultButtonStyles, secondary: true }));
				showMoreButton.element.classList.add('chat-debug-home-show-more');
				showMoreButton.label = localize('chatDebug.showMore', "Show More ({0})", remaining);
				this.renderDisposables.add(showMoreButton.onDidClick(() => {
					this._visibleCount += PAGE_SIZE;
					this.render();
				}));
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
