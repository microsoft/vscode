/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventType, getWindow, reset } from '../../../base/browser/dom.js';
import { ScrollableElement } from '../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
import { autorun } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { Action } from '../../../base/common/actions.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { InputBox } from '../../../base/browser/ui/inputbox/inputBox.js';
import { defaultInputBoxStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { Menus } from '../menus.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { localize } from '../../../nls.js';
import { ChatInteractivity, getChatCapabilities, IChat, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { applySessionBarThemeColors } from './sessionBarStyles.js';

interface IChatTab {
	readonly chat: IChat;
	readonly element: HTMLElement;
	readonly inputContainer: HTMLElement;
}

/**
 * A composite bar that displays the chats within an agent session as tabs.
 * Selecting a tab loads that chat in the chat view pane instead of switching view containers.
 *
 * The bar is shown only when the session has multiple chats; a single chat is already
 * represented by the {@link SessionHeader} title.
 *
 * The hosting view tells the bar which session is relevant via {@link setSession}.
 */
export class ChatCompositeBar extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _tabsRow: HTMLElement;
	private readonly _tabsContainer: HTMLElement;
	private readonly _tabsScrollbar: ScrollableElement;
	private readonly _tabs: IChatTab[] = [];
	private readonly _tabDisposables = this._register(new DisposableStore());

	private readonly _sessionDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _editingDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _editingTab: IChatTab | undefined;
	private _session: IActiveSession | undefined;
	private readonly _newChatAction: Action;
	private readonly _newChatContainer: HTMLElement;
	private readonly _actionMenuToolbar: MenuWorkbenchToolBar;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _visible = false;

	get element(): HTMLElement {
		return this._container;
	}

	get visible(): boolean {
		return this._visible;
	}

	get height(): number {
		return this._visible ? this._container.offsetHeight : 0;
	}

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._container = $('.chat-composite-bar.session-chat-tabs-bar');

		// Tabs row — only shown when the session has multiple chats.
		this._tabsRow = $('.chat-composite-bar-tabs-row');
		this._container.appendChild(this._tabsRow);

		this._tabsContainer = $('.chat-composite-bar-tabs');
		this._tabsContainer.setAttribute('role', 'tablist');
		this._tabsContainer.setAttribute('aria-label', localize('chatTabsAriaLabel', "Chats"));
		this._tabsScrollbar = this._register(new ScrollableElement(this._tabsContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
		}));
		this._tabsRow.appendChild(this._tabsScrollbar.getDomNode());

		// "New Chat" button pinned at the end of the tab strip (after the last
		// tab). Starting a new chat is offered here while the tabs are shown; when
		// the session has a single chat the session header toolbar offers it
		// instead.
		const newChatAction = this._newChatAction = this._register(new Action(
			'chatCompositeBar.addChat',
			localize('chatCompositeBar.addChat', "New Chat"),
			ThemeIcon.asClassName(Codicon.add),
			true,
			async () => {
				const session = this._session;
				if (session && !session.isArchived.get()) {
					await this._sessionsService.openNewChatInSession(session);
					this._sessionsPartService.focusSession(session);
				}
			},
		));
		const newChatActionBar = this._register(new ActionBar(this._tabsRow, { actionViewItemProvider: undefined }));
		newChatActionBar.push(newChatAction, { icon: true, label: false });
		this._newChatContainer = newChatActionBar.getContainer();
		this._newChatContainer.classList.add('chat-composite-bar-new-chat');

		// Chat tab bar action menu (e.g. the Conversations dropdown) right-aligned
		// at the end of the strip; items are contributed into Menus.SessionChatTabBar.
		const actionMenuContainer = $('.chat-composite-bar-action-menu');
		this._tabsRow.appendChild(actionMenuContainer);
		this._actionMenuToolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionMenuContainer, Menus.SessionChatTabBar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
		}));

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

		// Scroll active tab into view + update scroll dimensions on resize
		const resizeObserver = this._register(new DisposableResizeObserver('ChatCompositeBar.activeTabReveal', () => {
			this._updateScrollDimensions();
			this._revealActiveTab();
		}));
		this._register(resizeObserver.observe(this._tabsContainer));

		// Report height changes so the host can re-layout
		const heightObserver = this._register(new DisposableResizeObserver('ChatCompositeBar.height', () => {
			this._onDidChangeHeight.fire();
		}));
		this._register(heightObserver.observe(this._container));

		this._setVisible(false);
		this._updateStyles();
		this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
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

		this._actionMenuToolbar.context = session;

		const store = new DisposableStore();
		this._sessionDisposables.value = store;

		if (!session) {
			this._rebuildTabs([], '', undefined);
			this._setVisible(false);
			return;
		}

		// Visibility (and the trailing "New Chat") follow session.shouldShowChatTabs, once created.
		this._setVisible(false);
		store.add(autorun(reader => {
			const mainChat = session.mainChat.read(reader);
			const activeChatUri = session.activeChat.read(reader)?.resource.toString() ?? '';
			const mainChatUri = mainChat.resource.toString();
			const tabs = session.visibleChatTabs.read(reader);
			this._rebuildTabs(tabs, activeChatUri, mainChatUri);

			// The trailing "New Chat" action only applies to sessions that support
			// user-created peer chats. Subagent (read-only) tabs can surface in
			// sessions without that capability, so gate the action on the
			// capability rather than on tab-strip visibility.
			const supportsMultipleChats = session.capabilities.read(reader).supportsMultipleChats;
			this._newChatContainer.classList.toggle('hidden', !supportsMultipleChats);
			// Archived sessions are read-only, so disable the trailing New Chat
			// action (mirrors the header action's SessionIsArchivedContext gating).
			this._newChatAction.enabled = supportsMultipleChats && !session.isArchived.read(reader);

			this._setVisible(session.isCreated.read(reader) && session.shouldShowChatTabs.read(reader));
		}));
	}

	private _rebuildTabs(chats: readonly IChat[], activeChatId: string, mainChatId?: string): void {
		this._cancelTabEditing();
		this._tabDisposables.clear();
		this._tabs.length = 0;
		reset(this._tabsContainer);

		for (const chat of chats) {
			this._createTab(chat, chat.resource.toString() === mainChatId);
		}

		this._updateActiveTab(activeChatId);
		this._updateScrollDimensions();

		this._onDidChangeHeight.fire();
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
		// Expose the bound chat resource for diagnostics / test automation.
		tab.dataset.chatResource = chat.resource.toString();
		tab.dataset.isMainChat = String(isMainChat);

		const labelEl = $('.chat-composite-bar-tab-label');
		this._tabDisposables.add(autorun(reader => {
			const title = chat.title.read(reader);
			labelEl.textContent = title;
		}));

		// Lock icon shown for read-only (non-interactive) chats.
		const lockIcon = $('.chat-composite-bar-tab-lock');
		lockIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.lock));
		tab.appendChild(lockIcon);
		this._tabDisposables.add(autorun(reader => {
			const isReadOnly = chat.interactivity.read(reader) === ChatInteractivity.ReadOnly;
			tab.classList.toggle('read-only', isReadOnly);
			tab.dataset.interactivity = chat.interactivity.read(reader);
		}));

		tab.appendChild(labelEl);

		// Empty rename host; an InputBox is created inside it only while editing.
		const inputContainer = $('.chat-composite-bar-tab-input-container');
		tab.appendChild(inputContainer);

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

		// Close button — contributed via Menus.SessionChatTab (the chat tab menu).
		// Only non-main chats can be closed; the main chat lives and dies with its
		// session, so its tab renders no actions toolbar. The tab's chat (and its
		// session) is forwarded as the action argument.
		if (!isMainChat && session) {
			const actionsContainer = $('.chat-composite-bar-tab-actions');
			tab.appendChild(actionsContainer);
			const tabToolbar = this._tabDisposables.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, Menus.SessionChatTab, {
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				menuOptions: { shouldForwardArgs: true },
				toolbarOptions: { primaryGroup: () => true },
			}));
			tabToolbar.context = { session, chat };
		}

		this._tabsContainer.appendChild(tab);

		const chatTab: IChatTab = { chat, element: tab, inputContainer };

		this._tabDisposables.add(addDisposableListener(tab, EventType.CLICK, () => {
			// Cancel any in-progress rename before switching to the clicked tab.
			this._cancelTabEditing();
			this._onTabClicked(chat);
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._onTabClicked(chat);
			}
		}));

		const renameAction = this._tabDisposables.add(new Action('sessionCompositeBar.renameChat', localize('renameChat', "Rename"), undefined, true, async () => {
			this._startTabEditing(chatTab);
		}));

		// Delete permanently removes the chat (destructive). Only non-main chats
		// can be deleted; the main chat lives and dies with its session.
		const deleteAction = this._tabDisposables.add(new Action('sessionCompositeBar.deleteChat', localize('deleteChat', "Delete Chat"), undefined, true, async () => {
			if (this._session) {
				await this._sessionsManagementService.deleteChat(this._session, chat.resource);
			}
		}));

		// Double-click the tab to start an inline rename, mirroring the session title.
		this._tabDisposables.add(addDisposableListener(tab, EventType.DBLCLICK, (e: MouseEvent) => {
			if (chat.status.get() === SessionStatus.Untitled || !getChatCapabilities(chat, session, undefined).canRename) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			this._startTabEditing(chatTab);
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
				getActions: () => {
					const capabilities = getChatCapabilities(chat, session, undefined);
					const actions = [];
					if (capabilities.canRename) {
						actions.push(renameAction);
					}
					if (capabilities.canDelete) {
						actions.push(deleteAction);
					}
					return actions;
				}
			});
		}));

		this._tabs.push(chatTab);
	}

	private _onTabClicked(chat: IChat): void {
		if (this._session) {
			this._sessionsService.openChat(this._session, chat.resource);
		}
	}

	/**
	 * Start an inline rename for the given tab. Enter commits via
	 * {@link ISessionsManagementService.renameChat}; Escape or blur cancels.
	 */
	private _startTabEditing(chatTab: IChatTab): void {
		const session = this._session;
		if (!session || this._editingTab) {
			return;
		}

		const { chat, element: tab, inputContainer } = chatTab;
		const initialTitle = chat.title.get();

		this._editingTab = chatTab;
		tab.classList.add('editing');

		const store = new DisposableStore();
		this._editingDisposables.value = store;

		const inputBox = store.add(new InputBox(inputContainer, this._contextViewService, {
			ariaLabel: localize('renameChat.aria', "Rename chat"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		inputBox.element.classList.add('chat-composite-bar-tab-input');
		inputBox.value = initialTitle;
		inputBox.focus();
		inputBox.select();

		let finished = false;
		const finish = (commit: boolean) => {
			if (finished) {
				return;
			}
			finished = true;
			const newTitle = inputBox.value.trim();
			this._endTabEditing();
			if (commit && newTitle && newTitle !== initialTitle) {
				this._sessionsManagementService
					.renameChat(session, chat.resource, newTitle)
					.catch(onUnexpectedError);
			}
		};

		store.add(addStandardDisposableListener(inputBox.inputElement, EventType.KEY_DOWN, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				e.preventDefault();
				e.stopPropagation();
				finish(true);
			} else if (e.equals(KeyCode.Escape)) {
				e.preventDefault();
				e.stopPropagation();
				finish(false);
			} else {
				// Don't let typing leak out to workbench shortcuts (e.g. Space).
				e.stopPropagation();
			}
		}));

		store.add(addDisposableListener(inputBox.inputElement, EventType.BLUR, () => finish(false)));

		store.add(addDisposableListener(inputBox.element, EventType.CLICK, e => e.stopPropagation()));
		store.add(addDisposableListener(inputBox.element, EventType.DBLCLICK, e => e.stopPropagation()));
	}

	private _cancelTabEditing(): void {
		if (!this._editingTab) {
			return;
		}
		this._endTabEditing();
	}

	private _endTabEditing(): void {
		const editingTab = this._editingTab;
		this._editingTab = undefined;
		this._editingDisposables.clear();
		if (editingTab) {
			editingTab.element.classList.remove('editing');
			// InputBox.dispose() does not detach its node, so empty the container.
			reset(editingTab.inputContainer);
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
		applySessionBarThemeColors(this._container, this._themeService.getColorTheme());
	}
}
