/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableListener, EventType, getWindow, reset } from '../../../base/browser/dom.js';
import { autorun } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND } from '../../../workbench/common/theme.js';
import { agentsPanelBackground } from '../../common/theme.js';
import { Action } from '../../../base/common/actions.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { localize } from '../../../nls.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { IChat, SessionStatus } from '../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';

interface IChatTab {
	readonly chat: IChat;
	readonly element: HTMLElement;
}

/**
 * A composite bar that displays chats within the active agent session as tabs.
 * Selecting a tab loads that chat in the chat view pane instead of switching view containers.
 *
 * The bar auto-hides when there is only one chat in the active session and shows when there are multiple.
 */
export class ChatCompositeBar extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _tabsContainer: HTMLElement;
	private readonly _tabs: IChatTab[] = [];
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
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();

		this._container = $('.chat-composite-bar');
		this._tabsContainer = $('.chat-composite-bar-tabs');
		this._container.appendChild(this._tabsContainer);

		// Track active session changes
		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (!activeSession) {
				this._rebuildTabs([], '', undefined);
				return;
			}

			const chats = activeSession.chats.read(reader);
			const activeChatUri = activeSession.activeChat.read(reader)?.resource.toString() ?? '';
			const mainChatUri = activeSession.mainChat.resource.toString();
			this._rebuildTabs(chats, activeChatUri, mainChatUri);
		}));


		this._updateStyles();
		this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
	}

	private _rebuildTabs(chats: readonly IChat[], activeChatId: string, mainChatId?: string): void {
		this._tabDisposables.clear();
		this._tabs.length = 0;
		reset(this._tabsContainer);

		for (const chat of chats) {
			this._createTab(chat, chat.resource.toString() === mainChatId);
		}

		this._updateActiveTab(activeChatId);
		this._updateVisibility();
	}

	private _createTab(chat: IChat, isMainChat: boolean): void {
		const tab = $('.chat-composite-bar-tab');
		tab.tabIndex = 0;
		tab.setAttribute('role', 'tab');

		const labelEl = $('.chat-composite-bar-tab-label');
		this._tabDisposables.add(autorun(reader => {
			const title = chat.title.read(reader);
			labelEl.textContent = title;
		}));
		tab.appendChild(labelEl);

		// Track untitled state for styling (dirty dot + close button)
		this._tabDisposables.add(autorun(reader => {
			const status = chat.status.read(reader);
			tab.classList.toggle('untitled', status === SessionStatus.Untitled);
		}));

		// Remove action bar — only for non-main chats, visible on hover
		if (!isMainChat) {
			const closeAction = this._tabDisposables.add(new Action(
				'chatCompositeBar.closeChat',
				localize('closeChat', "Close"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				async () => {
					const session = this._sessionsManagementService.activeSession.get();
					if (session) {
						await this._sessionsManagementService.deleteChat(session, chat.resource);
					}
				},
			));
			const actionBar = this._tabDisposables.add(new ActionBar(tab, { actionViewItemProvider: undefined }));
			actionBar.push(closeAction, { icon: true, label: false });
			actionBar.getContainer().classList.add('chat-composite-bar-tab-actions');
		}

		const indicator = $('.chat-composite-bar-tab-indicator');
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

		const renameAction = this._tabDisposables.add(new Action('sessionCompositeBar.renameChat', localize('renameChat', "Rename"), undefined, true, async () => {
			const newTitle = await this._quickInputService.input({
				value: chat.title.get(),
				prompt: localize('renameChat.prompt', "Rename Chat"),
			});
			if (newTitle) {
				const session = this._sessionsManagementService.activeSession.get();
				if (session) {
					await this._sessionsManagementService.renameChat(session, chat.resource, newTitle);
				}
			}
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.CONTEXT_MENU, (e: MouseEvent) => {
			// No context menu for untitled chats
			if (chat.status.get() === SessionStatus.Untitled) {
				e.preventDefault();
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			const event = new StandardMouseEvent(getWindow(tab), e);
			this._contextMenuService.showContextMenu({
				getAnchor: () => event,
				getActions: () => [
					renameAction,
				]
			});
		}));

		this._tabs.push({ chat: chat, element: tab });
	}

	private _onTabClicked(chat: IChat): void {
		const session = this._sessionsManagementService.activeSession.get();
		if (session) {
			this._sessionsManagementService.openChat(session, chat.resource);
		}
	}

	private _updateActiveTab(activeChatId: string): void {
		for (const tab of this._tabs) {
			const isActive = tab.chat.resource.toString() === activeChatId;
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

		const bg = theme.getColor(agentsPanelBackground);
		const activeFg = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
		const inactiveFg = theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND);
		const activeBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);

		this._container.style.setProperty('--chat-bar-background', bg?.toString() ?? '');
		this._container.style.setProperty('--chat-tab-active-foreground', activeFg?.toString() ?? '');
		this._container.style.setProperty('--chat-tab-inactive-foreground', inactiveFg?.toString() ?? '');
		this._container.style.setProperty('--chat-tab-active-border', activeBorder?.toString() ?? '');
	}
}
