/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableListener, DisposableResizeObserver, EventType, getWindow, reset } from '../../../base/browser/dom.js';
import { ScrollableElement } from '../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
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
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { Menus } from '../menus.js';
import { LocalSelectionTransfer } from '../../../platform/dnd/browser/dnd.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../dnd.js';
import { applyDragImage } from '../../../base/browser/ui/dnd/dnd.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';

interface IChatTab {
	readonly chat: IChat;
	readonly element: HTMLElement;
}

/**
 * A composite bar that displays chats within an agent session as tabs.
 * Selecting a tab loads that chat in the chat view pane instead of switching view containers.
 *
 * The bar auto-hides when there is only one chat in the session and shows when there are multiple.
 *
 * The hosting view tells the bar which session is relevant via {@link setSession}.
 */
export class ChatCompositeBar extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _tabsContainer: HTMLElement;
	private readonly _tabsScrollbar: ScrollableElement;
	private readonly _toolbar: MenuWorkbenchToolBar;
	private readonly _inlineToolbar: MenuWorkbenchToolBar;
	private readonly _tabs: IChatTab[] = [];
	private readonly _tabDisposables = this._register(new DisposableStore());

	private readonly _sessionDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _session: IActiveSession | undefined;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private _visible = false;

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

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
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._container = $('.chat-composite-bar');
		this._tabsContainer = $('.chat-composite-bar-tabs');

		this._tabsScrollbar = this._register(new ScrollableElement(this._tabsContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
		}));
		this._container.appendChild(this._tabsScrollbar.getDomNode());

		// Keep the visual scrollbar in sync with native scrolling inside the tabs container
		this._register(addDisposableListener(this._tabsContainer, EventType.SCROLL, () => {
			this._tabsScrollbar.setScrollPosition({ scrollLeft: this._tabsContainer.scrollLeft });
		}));

		// Forward scrollbar changes (e.g. from mouse wheel) back to the native scroll position
		this._register(this._tabsScrollbar.onScroll(e => {
			if (e.scrollLeftChanged) {
				this._tabsContainer.scrollLeft = e.scrollLeft;
			}
		}));

		const inlineToolbarContainer = $('.chat-composite-bar-inline-toolbar');
		this._container.appendChild(inlineToolbarContainer);
		this._inlineToolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, inlineToolbarContainer, Menus.SessionBarInlineToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
		}));

		const toolbarContainer = $('.chat-composite-bar-toolbar');
		this._container.appendChild(toolbarContainer);
		this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SessionBarToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
		}));

		// Scroll active tab into view + update scroll dimensions on resize
		const resizeObserver = this._register(new DisposableResizeObserver('ChatCompositeBar.activeTabReveal', () => {
			this._updateScrollDimensions();
			this._revealActiveTab();
		}));
		this._register(resizeObserver.observe(this._tabsContainer));

		this._setVisible(false);
		this._updateStyles();
		this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));

		this._registerDragSource();
	}

	private _registerDragSource(): void {
		this._container.draggable = true;

		this._register(addDisposableListener(this._container, EventType.DRAG_START, (e: DragEvent) => {
			const session = this._session;
			if (!session || !e.dataTransfer) {
				e.preventDefault();
				return;
			}

			this._sessionTransfer.setData(
				[new DraggedSessionIdentifier(session.sessionId, session.resource)],
				DraggedSessionIdentifier.prototype,
			);

			const payload = JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() });
			e.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
			e.dataTransfer.effectAllowed = 'move';

			applyDragImage(e, this._container, session.title.get());
		}));

		this._register(addDisposableListener(this._container, EventType.DRAG_END, () => {
			this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);
		}));
	}

	/**
	 * Tells the bar which session is currently relevant. The bar will display the chats
	 * of the given session and track its active chat. Pass `undefined` to clear.
	 */
	setSession(session: IActiveSession | undefined): void {
		if (this._session === session) {
			return;
		}
		this._session = session;
		this._toolbar.context = session;
		this._inlineToolbar.context = session;

		const store = new DisposableStore();
		this._sessionDisposables.value = store;

		if (!session) {
			this._rebuildTabs([], '', undefined);
			this._setVisible(false);
			return;
		}

		store.add(autorun(reader => {
			const chats = session.chats.read(reader);
			const activeChatUri = session.activeChat.read(reader)?.resource.toString() ?? '';
			const mainChatUri = session.mainChat.read(reader).resource.toString();
			this._rebuildTabs(chats, activeChatUri, mainChatUri);
		}));

		store.add(autorun(reader => {
			this._setVisible(session.isCreated.read(reader));
		}));
	}

	private _rebuildTabs(chats: readonly IChat[], activeChatId: string, mainChatId?: string): void {
		this._tabDisposables.clear();
		this._tabs.length = 0;
		reset(this._tabsContainer);

		for (const chat of chats) {
			this._createTab(chat, chat.resource.toString() === mainChatId);
		}

		this._updateActiveTab(activeChatId);
		this._updateScrollDimensions();
	}

	private _updateScrollDimensions(): void {
		this._tabsScrollbar.setScrollDimensions({
			width: this._tabsContainer.clientWidth,
			scrollWidth: this._tabsContainer.scrollWidth,
		});
	}

	private _createTab(chat: IChat, isMainChat: boolean): void {
		const session = this._session;
		const tab = $('.chat-composite-bar-tab');
		tab.tabIndex = 0;
		tab.setAttribute('role', 'tab');

		const labelEl = $('.chat-composite-bar-tab-label');
		this._tabDisposables.add(autorun(reader => {
			const title = chat.title.read(reader);
			labelEl.textContent = title;
		}));
		tab.appendChild(labelEl);

		// Delayed hover showing the full chat title (useful when the title is truncated)
		this._tabDisposables.add(this._hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			tab,
			() => chat.title.get(),
		));

		// Track untitled state for styling (dirty dot + close button)
		this._tabDisposables.add(autorun(reader => {
			const status = chat.status.read(reader);
			tab.classList.toggle('untitled', status === SessionStatus.Untitled);
		}));

		// Track unread / needs-input / in-progress state for the indicator.
		// Precedence: needs-input (unread) > in-progress (spinner) > unread when not active.
		// At most one indicator is shown at a time.
		const indicator = $('.chat-composite-bar-tab-indicator');
		const indicatorIcon = $('.chat-composite-bar-tab-indicator-icon');
		indicator.appendChild(indicatorIcon);
		this._tabDisposables.add(autorun(reader => {
			const activeChat = session?.activeChat.read(reader);
			const isActive = activeChat?.resource.toString() === chat.resource.toString();
			const status = chat.status.read(reader);
			const isRead = chat.isRead.read(reader);

			let mode: 'needs-input' | 'unread' | 'in-progress' | 'none' = 'none';
			if (status === SessionStatus.NeedsInput) {
				mode = 'needs-input';
			} else if (status === SessionStatus.InProgress) {
				mode = 'in-progress';
			} else if (!isRead && !isActive) {
				mode = 'unread';
			}

			tab.classList.toggle('needs-input', mode === 'needs-input');
			tab.classList.toggle('unread', mode === 'unread');
			tab.classList.toggle('in-progress', mode === 'in-progress');

			indicatorIcon.className = 'chat-composite-bar-tab-indicator-icon';
			if (mode === 'in-progress') {
				indicatorIcon.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, 'spin')));
			}
		}));

		tab.appendChild(indicator);

		// Close action — only for non-main chats, always visible
		if (!isMainChat) {
			const closeAction = this._tabDisposables.add(new Action(
				'chatCompositeBar.closeChat',
				localize('closeChat', "Close"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				async () => {
					if (this._session) {
						await this._sessionsManagementService.deleteChat(this._session, chat.resource);
					}
				},
			));
			const actionBar = this._tabDisposables.add(new ActionBar(tab, { actionViewItemProvider: undefined }));
			actionBar.push(closeAction, { icon: true, label: false });
			actionBar.getContainer().classList.add('chat-composite-bar-tab-actions');
		}

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
			if (newTitle && this._session) {
				await this._sessionsManagementService.renameChat(this._session, chat.resource, newTitle);
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
		if (this._session) {
			this._sessionsManagementService.openChat(this._session, chat.resource);
		}
	}

	private _updateActiveTab(activeChatId: string): void {
		for (const tab of this._tabs) {
			const isActive = tab.chat.resource.toString() === activeChatId;
			tab.element.classList.toggle('active', isActive);
			tab.element.setAttribute('aria-selected', String(isActive));
			if (isActive) {
				tab.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			}
		}
	}

	private _revealActiveTab(): void {
		const activeTab = this._tabs.find(t => t.element.classList.contains('active'));
		activeTab?.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	private _setVisible(visible: boolean): void {
		const wasVisible = this._visible;
		this._visible = visible;
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

/**
 * A lightweight variant of {@link ChatCompositeBar} that renders only the
 * {@link Menus.SessionBarToolbar} menu using the same `.chat-composite-bar-toolbar`
 * styling. Unlike the full composite bar, this toolbar is absolutely positioned
 * at the top-right of the session view and does not allocate any vertical space.
 *
 * It is shown only when the hosted session exists but has not yet been created.
 */
export class SessionViewFloatingToolbar extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _toolbar: MenuWorkbenchToolBar;
	private _session: IActiveSession | undefined;
	private readonly _sessionDisposables = this._register(new MutableDisposable<DisposableStore>());

	get element(): HTMLElement {
		return this._container;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._container = $('.chat-composite-bar.chat-composite-bar-toolbar-floating');
		const toolbar = $('.chat-composite-bar-toolbar');
		this._container.appendChild(toolbar);

		this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbar, Menus.SessionBarToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
		}));

		this._setVisible(false);
	}

	setSession(session: IActiveSession | undefined): void {
		if (this._session === session) {
			return;
		}
		this._session = session;
		this._toolbar.context = session;

		const store = new DisposableStore();
		this._sessionDisposables.value = store;

		if (!session) {
			this._setVisible(false);
			return;
		}

		store.add(autorun(reader => {
			this._setVisible(!session.isCreated.read(reader));
		}));
	}

	private _setVisible(visible: boolean): void {
		this._container.style.display = visible ? '' : 'none';
	}
}
