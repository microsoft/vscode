/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventType, getWindow, reset } from '../../../base/browser/dom.js';
import { applyDragImage } from '../../../base/browser/ui/dnd/dnd.js';
import { ScrollableElement } from '../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { Action } from '../../../base/common/actions.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { InputBox } from '../../../base/browser/ui/inputbox/inputBox.js';
import { defaultInputBoxStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { localize } from '../../../nls.js';
import { URI } from '../../../base/common/uri.js';
import { IChat, SessionStatus } from '../../services/sessions/common/session.js';
import { LocalSelectionTransfer } from '../../../platform/dnd/browser/dnd.js';
import { DraggedChatIdentifier, SessionsDataTransfers } from '../dnd.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { applySessionBarThemeColors } from './sessionBarStyles.js';

interface IChatTab {
	readonly chat: IChat;
	readonly element: HTMLElement;
	readonly inputContainer: HTMLElement;
}

/**
 * The data + callbacks a {@link ChatCompositeBar} needs to render the tabs of a
 * single chat group. Supplied by the owning {@link ChatGroupView} so the bar is
 * a passive renderer that does not reach into session services directly.
 */
export interface IChatCompositeBarDelegate {

	/** The session whose chats are partitioned across groups. */
	readonly sessionId: string;

	/** The chats assigned to this group, in tab order. */
	readonly chats: IObservable<readonly IChat[]>;

	/** The resource (as a string) of the chat shown by this group. */
	readonly activeChatResource: IObservable<string>;

	/** The session's main chat resource (as a string); its tab is not closeable. */
	readonly mainChatResource: IObservable<string>;

	/** Whether the tab strip should be shown. */
	readonly visible: IObservable<boolean>;

	/** Activate (show + focus) the given chat within this group. */
	openChat(resource: URI): void;

	/** Close (hide) the given chat from the tab strip; it remains reopenable. */
	closeChat(resource: URI): void;

	/** Permanently delete the given chat. */
	deleteChat(resource: URI): void;

	/** Rename the given chat. */
	renameChat(resource: URI, title: string): void;

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
	private readonly _tabs: IChatTab[] = [];
	private readonly _tabDisposables = this._register(new DisposableStore());

	private readonly _groupDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _editingDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _editingTab: IChatTab | undefined;
	private _delegate: IChatCompositeBarDelegate | undefined;

	private readonly _chatTransfer = LocalSelectionTransfer.getInstance<DraggedChatIdentifier>();

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
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IHoverService private readonly _hoverService: IHoverService,
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
			// Keep the provider's order, but move untitled (in-composer) chats
			// to the end so a just-completed background chat never jumps last.
			// Partition so each chat's status is read exactly once (tracked) and
			// relative order is preserved by construction.
			const committed: IChat[] = [];
			const untitled: IChat[] = [];
			for (const chat of chats) {
				(chat.status.read(reader) === SessionStatus.Untitled ? untitled : committed).push(chat);
			}
			const orderedChats = untitled.length === 0 ? chats : [...committed, ...untitled];
			this._rebuildTabs(orderedChats, activeChatUri, mainChatUri);
		}));
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

	private _createTab(chat: IChat, isMainChat: boolean, activeChatId: string): void {
		const delegate = this._delegate;
		const tab = $('.chat-composite-bar-tab');
		tab.tabIndex = 0;
		tab.setAttribute('role', 'tab');
		tab.draggable = true;

		const labelEl = $('.chat-composite-bar-tab-label');
		this._tabDisposables.add(autorun(reader => {
			const title = chat.title.read(reader);
			labelEl.textContent = title;
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

		// Close action — only for non-main chats, always visible. Closing hides the
		// chat from the tab strip (reopenable from the chats dropdown in the
		// session header); use Delete to remove it permanently.
		if (!isMainChat) {
			const closeAction = this._tabDisposables.add(new Action(
				'chatCompositeBar.closeChat',
				localize('closeChat', "Close"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				async () => this._delegate?.closeChat(chat.resource),
			));
			const actionBar = this._tabDisposables.add(new ActionBar(tab, { actionViewItemProvider: undefined }));
			actionBar.push(closeAction, { icon: true, label: false });
			actionBar.getContainer().classList.add('chat-composite-bar-tab-actions');
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

		// Dragging a tab makes it available for the group drop targets.
		this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_START, (e: DragEvent) => {
			if (!delegate) {
				return;
			}
			this._cancelTabEditing();
			this._chatTransfer.setData([new DraggedChatIdentifier(delegate.sessionId, chat.resource)], DraggedChatIdentifier.prototype);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData(SessionsDataTransfers.CHAT, chat.resource.toString());
			}
			applyDragImage(e, tab, chat.title.get());
			delegate.onTabDragStart?.(chat.resource);
		}));

		this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_END, () => {
			this._chatTransfer.clearData(DraggedChatIdentifier.prototype);
			this._delegate?.onTabDragEnd?.();
		}));

		const renameAction = this._tabDisposables.add(new Action('sessionCompositeBar.renameChat', localize('renameChat', "Rename"), undefined, true, async () => {
			this._startTabEditing(chatTab);
		}));

		// Delete permanently removes the chat (destructive). Only non-main chats
		// can be deleted; the main chat lives and dies with its session.
		const deleteAction = this._tabDisposables.add(new Action('sessionCompositeBar.deleteChat', localize('deleteChat', "Delete Chat"), undefined, true, async () => {
			this._delegate?.deleteChat(chat.resource);
		}));

		// Double-click the tab to start an inline rename, mirroring the session title.
		this._tabDisposables.add(addDisposableListener(tab, EventType.DBLCLICK, (e: MouseEvent) => {
			if (chat.status.get() === SessionStatus.Untitled) {
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
				getActions: () => isMainChat
					? [renameAction]
					: [renameAction, deleteAction]
			});
		}));

		this._tabs.push(chatTab);
	}

	/**
	 * Start an inline rename for the given tab. Enter commits via the delegate;
	 * Escape or blur cancels.
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
				delegate.renameChat(chat.resource, newTitle);
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
