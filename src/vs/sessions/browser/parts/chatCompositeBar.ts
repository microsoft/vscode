/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableGenericMouseDownListener, addDisposableGenericMouseUpListener, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventHelper, EventType, getWindow, isHTMLElement, reset } from '../../../base/browser/dom.js';
import { applyDragImage } from '../../../base/browser/ui/dnd/dnd.js';
import { ScrollableElement } from '../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { isLinux } from '../../../base/common/platform.js';
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
import { clearChatReferenceDragData, fillChatReferenceDragData, fillSessionChatDragData } from '../dnd.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { applySessionBarThemeColors } from './sessionBarStyles.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider } from '../../common/agentHostSessionsProvider.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { CLOSE_CHAT_COMMAND_ID } from '../../common/sessionCommands.js';
import { getSessionConversationStatusAriaLabel } from '../sessionConversationGroups.js';

interface IChatTab {
	readonly chat: IChat;
	readonly element: HTMLElement;
	readonly inputContainer: HTMLElement;
}

/**
 * The data + callbacks a {@link ChatCompositeBar} needs to render the tabs of a
 * single chat group. Supplied by the owning {@link ChatGroupView} so the bar
 * renders one group's chats while routing chat activation/creation back to the
 * grid orchestrator instead of reaching into session navigation directly.
 */
export interface IChatCompositeBarDelegate {

	/**
	 * The session whose chats are partitioned across groups. The bar reads it for
	 * the contributed tab menus (whose actions act on `{ session, chat }`), chat
	 * drag data, and rename/delete operations.
	 */
	readonly session: IActiveSession;

	/** The chats assigned to this group, in tab order. */
	readonly chats: IObservable<readonly IChat[]>;

	/** The resource (as a string) of the chat shown by this group. */
	readonly activeChatResource: IObservable<string>;

	/** The session's main chat resource (as a string); its tab is not closeable. */
	readonly mainChatResource: IObservable<string>;

	/** Whether the tab strip should be shown. */
	readonly visible: IObservable<boolean>;

	/** Whether this single group's tab row replaces the session header and shows its actions. */
	readonly showSessionActions: IObservable<boolean>;

	/** Activate (show + focus) the given chat within this group. */
	openChat(resource: URI): void;

	/** Start a new chat within this group. */
	newChat(): void;

	/** A chat tab drag has started for the given chat. */
	onTabDragStart?(resource: URI): void;

	/** A chat tab drag has ended. */
	onTabDragEnd?(): void;
}

/**
 * A composite bar that displays the chats of a single chat group as tabs.
 * Selecting a tab activates that chat within the group; tabs can be dragged to
 * another group (or to an edge to split into a new group).
 *
 * The bar is a passive renderer driven by an {@link IChatCompositeBarDelegate}
 * supplied via {@link setGroup}.
 */
export class ChatCompositeBar extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _tabsRow: HTMLElement;
	private readonly _tabsContainer: HTMLElement;
	private readonly _tabsScrollbar: ScrollableElement;
	private readonly _newChatAction: Action;
	private readonly _newChatContainer: HTMLElement;
	private readonly _sessionActionsContainer: HTMLElement;
	private readonly _sessionToolbar: MenuWorkbenchToolBar;
	private readonly _tabs: IChatTab[] = [];
	private readonly _tabDisposables = this._register(new DisposableStore());

	private readonly _groupDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _editingDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _editingTab: IChatTab | undefined;
	private _delegate: IChatCompositeBarDelegate | undefined;
	private _showSessionActions = false;

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
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._container = $('.chat-composite-bar.session-chat-tabs-bar');

		// Tabs row — only shown when the group has multiple chats or is split out.
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

		this._newChatAction = this._register(new Action(
			'sessions.chatCompositeBar.addChat',
			localize('chatCompositeBar.addChat', "New Chat in This Session"),
			ThemeIcon.asClassName(Codicon.add),
			true,
			async () => this._delegate?.newChat(),
		));
		const newChatActionBar = this._register(new ActionBar(this._tabsRow));
		newChatActionBar.push(this._newChatAction, { icon: true, label: false });
		this._newChatContainer = newChatActionBar.getContainer();
		this._newChatContainer.classList.add('chat-composite-bar-new-chat');

		this._sessionActionsContainer = $('.session-chat-tabs-actions');
		this._tabsRow.appendChild(this._sessionActionsContainer);
		const sessionToolbarContainer = $('.chat-composite-bar-toolbar');
		this._sessionActionsContainer.appendChild(sessionToolbarContainer);
		this._sessionToolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, sessionToolbarContainer, Menus.SessionBarToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
		}));

		const preventMiddleButtonDefault = (e: MouseEvent) => {
			if (e.button === 1 && !this._isInTabInput(e)) {
				e.preventDefault();
			}
		};
		this._register(addDisposableGenericMouseDownListener(this._tabsContainer, preventMiddleButtonDefault));
		// Prevent Linux primary-selection paste after the middle-button release (https://github.com/microsoft/vscode/issues/201696).
		if (isLinux) {
			this._register(addDisposableGenericMouseUpListener(this._tabsContainer, preventMiddleButtonDefault));
		}

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
	 * Tells the bar which chat group to render. The bar will display the chats
	 * of the given group and track its active chat. Pass `undefined` to clear.
	 */
	setGroup(delegate: IChatCompositeBarDelegate | undefined): void {
		if (this._delegate === delegate) {
			return;
		}

		this._delegate = delegate;
		this._sessionToolbar.context = delegate?.session;

		const store = new DisposableStore();
		this._groupDisposables.value = store;

		if (!delegate) {
			this._rebuildTabs([], '', '');
			this._setVisible(false);
			return;
		}

		// Visibility is driven reactively by the owning group via `delegate.visible`.
		this._setVisible(false);
		store.add(autorun(reader => {
			const chats = delegate.chats.read(reader);
			const activeChatUri = delegate.activeChatResource.read(reader);
			const mainChatUri = delegate.mainChatResource.read(reader);
			this._rebuildTabs(chats, activeChatUri, mainChatUri);
			const supportsMultipleChats = delegate.session.capabilities.read(reader).supportsMultipleChats;
			const isQuickChat = delegate.session.isQuickChat?.read(reader) ?? false;
			this._newChatContainer.classList.toggle('hidden', !supportsMultipleChats || isQuickChat);
			this._newChatAction.enabled = supportsMultipleChats && !isQuickChat && !delegate.session.isArchived.read(reader);
			this._showSessionActions = delegate.showSessionActions.read(reader);
			this._sessionActionsContainer.classList.toggle('hidden', !this._showSessionActions);

			this._setVisible(delegate.visible.read(reader));
		}));
	}

	setAriaLabel(label: string): void {
		this._tabsContainer.setAttribute('aria-label', label);
	}

	private _rebuildTabs(chats: readonly IChat[], activeChatId: string, mainChatId: string): void {
		this._cancelTabEditing();
		this._tabDisposables.clear();
		this._tabs.length = 0;
		reset(this._tabsContainer);

		for (const chat of chats) {
			this._createTab(chat, chat.resource.toString() === mainChatId, activeChatId);
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

	private _createTab(chat: IChat, isMainChat: boolean, _activeChatId: string): void {
		const delegate = this._delegate;
		const session = delegate?.session;
		const tab = $('.chat-composite-bar-tab.modern-ui-editor-tab');
		tab.tabIndex = 0;
		tab.setAttribute('role', 'tab');
		tab.draggable = true;
		// Expose the bound chat resource for diagnostics / test automation.
		tab.dataset.chatResource = chat.resource.toString();
		tab.dataset.isMainChat = String(isMainChat);

		const tabFill = $('.chat-composite-bar-tab-fill.modern-ui-editor-tab-fill', { 'aria-hidden': true });
		tab.appendChild(tabFill);

		const labelEl = $('.chat-composite-bar-tab-label.modern-ui-editor-tab-label');
		this._tabDisposables.add(autorun(reader => {
			const title = chat.title.read(reader);
			const status = chat.status.read(reader);
			labelEl.textContent = title;
			tab.setAttribute('aria-label', localize('chatTabAriaLabel', "{0}, {1}", title, getSessionConversationStatusAriaLabel(status)));
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
			const isActive = delegate?.activeChatResource.read(reader) === chat.resource.toString();
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
			this._delegate?.openChat(chat.resource);
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._delegate?.openChat(chat.resource);
			}
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.AUXCLICK, e => {
			if (e.button !== 1) {
				return;
			}
			if (this._isInTabInput(e)) {
				return;
			}

			EventHelper.stop(e, true);
			if (isMainChat || !session) {
				return;
			}

			this._cancelTabEditing();
			void this._commandService.executeCommand(CLOSE_CHAT_COMMAND_ID, { session, chat }).catch(onUnexpectedError);
		}));

		// A tab drag carries two payloads: a group-move payload (to move/split the
		// chat between grid groups) and a chat-reference payload (to drop into an
		// agent-host chat input as an inline `#chat:` reference).
		this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_START, (e: DragEvent) => {
			if (!delegate || !e.dataTransfer) {
				e.preventDefault();
				return;
			}
			// Don't start a drag from the tab's actions toolbar (e.g. close), a
			// small pointer move during a button click would otherwise swallow it.
			const target = e.target as HTMLElement | null;
			if (target?.closest('.chat-composite-bar-tab-actions')) {
				e.preventDefault();
				return;
			}
			// Don't start a drag while any tab rename is in progress.
			if (this._editingTab) {
				e.preventDefault();
				return;
			}
			this._cancelTabEditing();

			// Group-move payload (on dataTransfer, not the shared LocalSelectionTransfer
			// singleton) lets the chat be moved between groups / split out. It must not
			// use the singleton because the chat-reference payload below also uses it,
			// and the singleton holds only one payload at a time.
			fillSessionChatDragData(e, delegate.session.sessionId, chat.resource);

			// Chat-reference payload: requires the opaque backend chat URI, which
			// only the owning agent-host provider knows. When it is unavailable
			// (not agent-host backed, or state not yet hydrated) the drag simply
			// carries no reference.
			const backendChatResource = this._backendChatResource(chat);
			if (backendChatResource) {
				fillChatReferenceDragData(e, backendChatResource, chat.resource, chat.title.get());
			}

			e.dataTransfer.effectAllowed = 'copyMove';
			applyDragImage(e, tab, chat.title.get());
			delegate.onTabDragStart?.(chat.resource);
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_END, () => {
			clearChatReferenceDragData();
			this._delegate?.onTabDragEnd?.();
		}));

		const renameAction = this._tabDisposables.add(new Action('sessionCompositeBar.renameChat', localize('renameChat', "Rename"), undefined, true, async () => {
			this._startTabEditing(chatTab);
		}));

		// Delete permanently removes the chat (destructive). Only non-main chats
		// can be deleted; the main chat lives and dies with its session.
		const deleteAction = this._tabDisposables.add(new Action('sessionCompositeBar.deleteChat', localize('deleteChat', "Delete Chat"), undefined, true, async () => {
			if (delegate) {
				await this._sessionsManagementService.deleteChat(delegate.session, chat.resource);
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

	private _isInTabInput(event: MouseEvent): boolean {
		return isHTMLElement(event.target) && !!event.target.closest('.chat-composite-bar-tab-input-container');
	}

	/**
	 * Resolves the opaque backend chat URI for a chat tab so a dragged `#chat:`
	 * reference can carry it. Reaches the owning agent-host provider by id and
	 * asks it to look up the host-supplied backend resource. Returns `undefined`
	 * when the session is not agent-host backed or the provider has no hydrated
	 * state for the chat — the caller then offers no chat-reference payload.
	 */
	private _backendChatResource(chat: IChat): URI | undefined {
		const providerId = this._delegate?.session.providerId;
		if (!providerId) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(chat.resource) : undefined;
	}

	/**
	 * Start an inline rename for the given tab. Enter commits via
	 * {@link ISessionsManagementService.renameChat}; Escape or blur cancels.
	 */
	private _startTabEditing(chatTab: IChatTab): void {
		const delegate = this._delegate;
		if (!delegate || this._editingTab) {
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
					.renameChat(delegate.session, chat.resource, newTitle)
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
