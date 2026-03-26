/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionCompositeBar.css';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableListener, EventType, reset } from '../../../base/browser/dom.js';
import { autorun } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND } from '../../../workbench/common/theme.js';
// TODO: we should move the sessions management service to a more core location so that we don't have to depend on the entire sessions contrib in this common/browser component
// eslint-disable-next-line local/code-import-patterns
import { ISessionsManagementService } from '../../contrib/sessions/browser/sessionsManagementService.js';
// eslint-disable-next-line local/code-import-patterns
import { IChatData } from '../../contrib/sessions/common/sessionData.js';

interface ISessionTab {
	readonly chat: IChatData;
	readonly element: HTMLElement;
}

/**
 * A composite bar that displays chats within the active agent session as tabs.
 * Selecting a tab loads that chat in the chat view pane instead of switching view containers.
 *
 * The bar auto-hides when there is only one chat in the active session and shows when there are multiple.
 */
export class SessionCompositeBar extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _tabsContainer: HTMLElement;
	private readonly _tabs: ISessionTab[] = [];
	private readonly _tabDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private _visible = false;

	get element(): HTMLElement {
		return this._container;
	}

	get visible(): boolean {
		return this._visible;
	}

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._container = $('.session-composite-bar');
		this._tabsContainer = $('.session-composite-bar-tabs');
		this._container.appendChild(this._tabsContainer);

		// Track active session changes
		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (!activeSession) {
				this._rebuildTabs([], '');
				return;
			}

			const chats = activeSession.chats.read(reader);
			const activeChatId = activeSession.activeChat.map(c => c.chatId).read(reader);
			this._rebuildTabs(chats, activeChatId);
		}));


		this._updateStyles();
		this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
	}

	private _rebuildTabs(chats: readonly IChatData[], activeChatId: string): void {
		this._tabDisposables.clear();
		this._tabs.length = 0;
		reset(this._tabsContainer);

		for (const chat of chats) {
			this._createTab(chat);
		}

		this._updateActiveTab(activeChatId);
		this._updateVisibility();
	}

	private _createTab(chat: IChatData): void {
		const tab = $('.session-composite-bar-tab');
		tab.tabIndex = 0;
		tab.setAttribute('role', 'tab');

		const labelEl = $('.session-composite-bar-tab-label');
		this._tabDisposables.add(autorun(reader => {
			const title = chat.title.read(reader);
			labelEl.textContent = title;
		}));
		tab.appendChild(labelEl);

		const indicator = $('.session-composite-bar-tab-indicator');
		tab.appendChild(indicator);

		this._tabsContainer.appendChild(tab);

		this._tabDisposables.add(addDisposableListener(tab, EventType.CLICK, () => {
			this._onTabClicked(chat);
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._onTabClicked(chat);
			}
		}));

		this._tabs.push({ chat: chat, element: tab });
	}

	private _onTabClicked(chat: IChatData): void {
		this._sessionsManagementService.openChat(chat.resource);
	}

	private _updateActiveTab(activeChatId: string): void {
		for (const tab of this._tabs) {
			const isActive = tab.chat.chatId === activeChatId;
			tab.element.classList.toggle('active', isActive);
			tab.element.setAttribute('aria-selected', String(isActive));
		}
	}

	private _updateVisibility(): void {
		// Show when there are multiple sessions, hide when there is only one (or none)
		const wasVisible = this._visible;
		this._visible = this._tabs.length > 1;
		this._container.style.display = this._visible ? '' : 'none';
		if (wasVisible !== this._visible) {
			this._onDidChangeVisibility.fire(this._visible);
		}
	}

	private _updateStyles(): void {
		const theme = this._themeService.getColorTheme();

		const bg = theme.getColor(SIDE_BAR_BACKGROUND);
		const activeFg = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
		const inactiveFg = theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND);
		const activeBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);

		this._container.style.setProperty('--session-bar-background', bg?.toString() ?? '');
		this._container.style.setProperty('--session-tab-active-foreground', activeFg?.toString() ?? '');
		this._container.style.setProperty('--session-tab-inactive-foreground', inactiveFg?.toString() ?? '');
		this._container.style.setProperty('--session-tab-active-border', activeBorder?.toString() ?? '');
	}
}
