/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventType, getWindow, isMouseEvent } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { autorun, IReader } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { localize } from '../../../nls.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { getUntitledSessionTitle } from '../../services/sessions/common/session.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { Menus } from '../menus.js';
import { LocalSelectionTransfer } from '../../../platform/dnd/browser/dnd.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../dnd.js';
import { applyDragImage } from '../../../base/browser/ui/dnd/dnd.js';
import { applySessionBarThemeColors } from './sessionBarStyles.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { SessionStatusIcon } from '../sessionStatusIcon.js';

/**
 * The session header shown at the top of a session view. It surfaces the session
 * identity and session toolbar.
 *
 * It is intentionally decoupled from the {@link ChatCompositeBar} (the chat tab
 * strip) so the two surfaces evolve independently. The hosting view tells the
 * header which session is relevant via {@link setSession}.
 */
export class SessionHeader extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _iconEl: HTMLElement;
	private readonly _titleEl: HTMLElement;
	private readonly _titleTextEl: HTMLElement;
	private readonly _toolbar: MenuWorkbenchToolBar;
	private readonly _titleActionsEl: HTMLElement;

	private readonly _sessionDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _editingDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _renameInput: HTMLInputElement | undefined;
	private _session: IActiveSession | undefined;
	private _sessionIsCreated = false;
	private _requestedVisible = true;

	// dragstart's own target is always the draggable container, so this tracks the
	// preceding pointerdown's target to know where the gesture actually began.
	private _lastPointerDownTarget: Node | undefined;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _visible = false;

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	private readonly _statusIcon: SessionStatusIcon;

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
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._container = $('.chat-composite-bar.session-header-bar');

		// Header: a status icon column alongside the title and actions.
		const header = $('.chat-composite-bar-header');
		this._container.appendChild(header);

		this._iconEl = $('.chat-composite-bar-session-icon');
		header.appendChild(this._iconEl);
		this._statusIcon = this._register(instantiationService.createInstance(SessionStatusIcon, this._iconEl));

		const main = $('.chat-composite-bar-header-main');
		header.appendChild(main);

		const titleRow = $('.chat-composite-bar-title-row');
		main.appendChild(titleRow);

		this._titleEl = $('.chat-composite-bar-session-title');
		titleRow.appendChild(this._titleEl);

		// Wrap the title text in a span so we can swap it for an input when
		// the user clicks to rename without rebuilding the title slot itself.
		this._titleTextEl = $('span.chat-composite-bar-session-title-text');
		this._titleEl.appendChild(this._titleTextEl);

		// Click the title to start an inline rename. Click is preferred over
		// mousedown so that initiating a drag from the title doesn't also
		// flip into edit mode.
		this._register(addDisposableListener(this._titleEl, EventType.CLICK, () => {
			this.startTitleEditing();
		}));

		const titleActions = $('.chat-composite-bar-title-actions');
		titleRow.appendChild(titleActions);
		this._titleActionsEl = titleActions;

		const toolbarContainer = $('.chat-composite-bar-toolbar');
		titleActions.appendChild(toolbarContainer);
		this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SessionBarToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
		}));

		// Report height changes so the host can re-layout.
		const heightObserver = this._register(new DisposableResizeObserver('SessionHeader.height', () => {
			this._onDidChangeHeight.fire();
		}));
		this._register(heightObserver.observe(this._container));

		this._applyVisibility(false);
		this._updateStyles();
		this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));

		this._registerDragSource();
		this._registerContextMenu();
	}

	private _registerContextMenu(): void {
		this._register(addDisposableListener(this._container, EventType.CONTEXT_MENU, (e: MouseEvent) => {
			const session = this._session;
			if (!session) {
				return;
			}

			let anchor: HTMLElement | StandardMouseEvent = this._container;
			if (isMouseEvent(e)) {
				anchor = new StandardMouseEvent(getWindow(this._container), e);
			}

			e.preventDefault();
			e.stopPropagation();
			this._contextMenuService.showContextMenu({
				menuId: Menus.SessionHeaderContext,
				menuActionOptions: { shouldForwardArgs: true, arg: session },
				getAnchor: () => anchor,
				contextKeyService: this._contextKeyService,
			});
		}));
	}

	private _registerDragSource(): void {
		this._container.draggable = true;

		this._register(addDisposableGenericMouseDownListener(this._container, (e: MouseEvent) => {
			this._lastPointerDownTarget = (e.target as Node | null) ?? undefined;
		}));

		this._register(addDisposableListener(this._container, EventType.DRAG_START, (e: DragEvent) => {
			const session = this._session;
			if (!session || !e.dataTransfer) {
				e.preventDefault();
				return;
			}

			// Don't swallow a click on the toolbar into a session drag.
			const target = this._lastPointerDownTarget;
			if (target && this._titleActionsEl.contains(target)) {
				e.preventDefault();
				return;
			}

			// Don't initiate a drag while the title is being renamed.
			if (this._renameInput) {
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
	 * Tells the header which session is currently relevant. Pass `undefined` to clear.
	 */
	setSession(session: IActiveSession | undefined): void {
		if (this._session === session) {
			return;
		}
		// Cancel any in-flight rename when switching sessions.
		this._cancelTitleEditing();
		this._session = session;
		this._toolbar.context = session;
		this._statusIcon.reset();

		const store = new DisposableStore();
		this._sessionDisposables.value = store;

		if (!session) {
			this._sessionIsCreated = false;
			this._updateVisibility();
			return;
		}

		store.add(autorun(reader => {
			this._updateHeader(session, reader);
		}));

		store.add(autorun(reader => {
			this._sessionIsCreated = session.isCreated.read(reader);
			this._updateVisibility();
		}));
	}

	setVisible(visible: boolean): void {
		if (this._requestedVisible === visible) {
			return;
		}
		this._requestedVisible = visible;
		this._updateVisibility();
	}

	private _updateVisibility(): void {
		this._applyVisibility(this._sessionIsCreated && this._requestedVisible);
	}

	private _updateHeader(session: IActiveSession, reader: IReader): void {
		// Session icon — the SessionStatusIcon widget owns the rendering (spinner vs.
		// codicon, cross-fade, reduced-motion); here we just feed it the latest state.
		// Metadata is surfaced above the chat input, so the title keeps the
		// read/unread status indicator.
		const status = session.status.read(reader);
		const isRead = session.isRead.read(reader);
		const isArchived = session.isArchived.read(reader);
		this._statusIcon.setStatus(status, isRead, isArchived);

		// Session title — quick chats use "New Chat" as the untitled fallback.
		const isQuickChat = session.isQuickChat?.read(reader) ?? false;
		this._titleTextEl.textContent = session.title.read(reader) || getUntitledSessionTitle(isQuickChat);
		this._titleEl.classList.toggle('editable', this._isTitleEditable());
		this._onDidChangeHeight.fire();
	}

	private _applyVisibility(visible: boolean): void {
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

	/**
	 * The title is editable when the backing provider declares it supports
	 * renaming the session (`capabilities.supportsRename`). This is the same
	 * signal that gates the `Rename...` context menu action in the sessions list.
	 */
	private _isTitleEditable(): boolean {
		return !!this._session && (this._session.capabilities.get().supportsRename ?? false);
	}

	startTitleEditing(): void {
		if (!this._isTitleEditable() || this._renameInput) {
			return;
		}
		this._startTitleEditing();
	}

	/**
	 * Replace the rendered title text with an `<input>` containing the current
	 * title (pre-selected). Enter commits via {@link ISessionsManagementService.renameChat},
	 * Escape or blur cancels.
	 */
	private _startTitleEditing(): void {
		const session = this._session;
		if (!session || this._renameInput) {
			return;
		}

		const initialTitle = session.title.get();
		// When the stored title is empty the header shows a localized fallback.
		// Reflect that as a placeholder rather than seeding the input with it, so
		// the user neither sees a blank field nor accidentally commits the fallback.
		const fallbackTitle = getUntitledSessionTitle(session.isQuickChat?.get() ?? false);

		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'chat-composite-bar-session-title-input';
		input.value = initialTitle;
		input.placeholder = fallbackTitle;
		input.setAttribute('aria-label', localize('renameSession.aria', "Rename session"));
		input.spellcheck = false;

		this._titleTextEl.style.display = 'none';
		this._titleEl.appendChild(input);
		this._titleEl.classList.add('editing');
		this._renameInput = input;

		input.focus();
		input.select();

		const store = new DisposableStore();
		this._editingDisposables.value = store;

		let finished = false;
		const finish = (commit: boolean) => {
			if (finished) {
				return;
			}
			finished = true;
			const newTitle = input.value.trim();
			this._endTitleEditing();
			if (commit && newTitle && newTitle !== initialTitle) {
				this._sessionsManagementService
					.renameSession(session, newTitle)
					.catch(onUnexpectedError);
			}
		};

		store.add(addStandardDisposableListener(input, EventType.KEY_DOWN, (e: IKeyboardEvent) => {
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

		store.add(addDisposableListener(input, EventType.BLUR, () => {
			finish(false);
		}));

		// Swallow click/pointerdown on the input so the title's click handler
		// doesn't try to re-enter editing mode. Use the generic mousedown
		// helper which routes through `pointerdown` on iOS where mouse events
		// don't fire.
		store.add(addDisposableGenericMouseDownListener(input, e => e.stopPropagation()));
		store.add(addDisposableListener(input, EventType.CLICK, e => e.stopPropagation()));
	}

	private _cancelTitleEditing(): void {
		if (!this._renameInput) {
			return;
		}
		this._endTitleEditing();
	}

	private _endTitleEditing(): void {
		if (this._renameInput) {
			this._renameInput.remove();
			this._renameInput = undefined;
		}
		this._titleTextEl.style.display = '';
		this._titleEl.classList.remove('editing');
		this._editingDisposables.clear();
	}
}

/**
 * A lightweight toolbar that renders only the {@link Menus.SessionBarToolbar} menu
 * using the same `.chat-composite-bar-toolbar` styling. Unlike the full
 * {@link SessionHeader}, this toolbar is absolutely positioned at the top-right of
 * the session view and does not allocate any vertical space.
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
