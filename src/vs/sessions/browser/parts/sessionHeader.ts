/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCompositeBar.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, DisposableResizeObserver, EventType, getWindow, isMouseEvent } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { autorun, IObservable, IReader, observableSignalFromEvent } from '../../../base/common/observable.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ActionRunner, IAction } from '../../../base/common/actions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { Menus } from '../menus.js';
import { LocalSelectionTransfer } from '../../../platform/dnd/browser/dnd.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../dnd.js';
import { applyDragImage } from '../../../base/browser/ui/dnd/dnd.js';
import { applySessionBarThemeColors } from './sessionBarStyles.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { SessionStatusIcon } from '../sessionStatusIcon.js';
import { SessionHeaderMetaActionViewItem } from './sessionHeaderMetaActionViewItem.js';

/**
 * An action runner for the session header toolbars that promotes the header's
 * session to be the active session before running any contributed command. This
 * ensures commands (e.g. View All Changes) operate on the clicked session even when
 * a different session is currently active.
 */
class SessionActivatingActionRunner extends ActionRunner {

	constructor(
		private readonly _getSession: () => IActiveSession | undefined,
		private readonly _sessionsService: ISessionsService,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		const session = this._getSession();
		if (session) {
			this._sessionsService.setActive(session);
		}
		await super.runAction(action, context);
	}
}

/**
 * The session header shown at the top of a session view. It surfaces the session
 * status, metadata (workspace folder / changes / pull request pills), and the
 * session toolbar (e.g. Run, Open in VS Code, New Chat).
 *
 * It is intentionally decoupled from the {@link ChatCompositeBar} (the chat tab
 * strip) so the two surfaces evolve independently. The hosting view tells the
 * header which session is relevant via {@link setSession}.
 */
export class SessionHeader extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _iconEl: HTMLElement;
	private readonly _metaRow: HTMLElement;
	private readonly _toolbar: MenuWorkbenchToolBar;
	private readonly _metaToolbar: MenuWorkbenchToolBar;
	private readonly _titleActionsEl: HTMLElement;

	private readonly _sessionDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _session: IActiveSession | undefined;

	// dragstart's own target is always the draggable container, so this tracks the
	// preceding pointerdown's target to know where the gesture actually began.
	private _lastPointerDownTarget: Node | undefined;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _visible = false;

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	private readonly _metaActionsSignal: IObservable<void>;

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
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();

		this._container = $('.chat-composite-bar.session-header-bar');

		// Header: status, metadata pills, and session actions share one row. Session
		// identity lives in the window titlebar.
		const header = $('.chat-composite-bar-header');
		this._container.appendChild(header);

		this._iconEl = $('.chat-composite-bar-session-icon');
		header.appendChild(this._iconEl);
		this._statusIcon = this._register(instantiationService.createInstance(SessionStatusIcon, this._iconEl));

		this._metaRow = $('.chat-composite-bar-meta-row');
		header.appendChild(this._metaRow);

		const titleActions = $('.chat-composite-bar-title-actions');
		header.appendChild(titleActions);
		this._titleActionsEl = titleActions;

		const toolbarContainer = $('.chat-composite-bar-toolbar');
		titleActions.appendChild(toolbarContainer);
		this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SessionBarToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
			// Render every group in the primary slot with a separator between groups
			// so the actions stay visually grouped.
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
		}));

		// Session header meta toolbar. Actions are contributed into the generic
		// Menus.SessionHeaderMeta menu: the files view contributes the workspace
		// folder pill (opens the Files view), the changes view contributes the
		// diff-stats action (opens the multi-file diff editor) and the GitHub
		// contribution contributes the pull request pill (opens the PR on GitHub),
		// each rendered as a compact secondary button pill via
		// SessionHeaderMetaActionViewItem.
		const metaToolbarContainer = $('.chat-composite-bar-meta-toolbar');
		this._metaRow.appendChild(metaToolbarContainer);
		// Commands contributed into the header meta toolbar (e.g. View All Changes)
		// operate on this view's session. Promote it to the active session before
		// running any of them via a custom action runner, so the command always
		// targets the clicked session even when another session is active.
		const metaActionRunner = this._register(new SessionActivatingActionRunner(() => this._session, this._sessionsService));
		this._metaToolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, metaToolbarContainer, Menus.SessionHeaderMeta, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: { shouldForwardArgs: true },
			actionRunner: metaActionRunner,
			// Render every meta action as a consistent `icon title` pill unless it
			// registers its own action view item via IActionViewItemService.
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					return instantiationService.createInstance(SessionHeaderMetaActionViewItem, undefined, action, options);
				}
				return undefined;
			},
		}));
		// The meta row separator/visibility tracks whether the meta toolbar has any
		// contributed actions, so recompute the header whenever they change.
		this._metaActionsSignal = observableSignalFromEvent(this, this._metaToolbar.onDidChangeMenuItems);

		// Report height changes (e.g. meta row content wrapping) so the host can re-layout
		const heightObserver = this._register(new DisposableResizeObserver('SessionHeader.height', () => {
			this._onDidChangeHeight.fire();
		}));
		this._register(heightObserver.observe(this._container));

		this._setVisible(false);
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

			// Don't swallow a click on the toolbar or meta row pills into a session drag.
			const target = this._lastPointerDownTarget;
			if (target && (this._titleActionsEl.contains(target) || this._metaRow.contains(target))) {
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
		this._session = session;
		this._toolbar.context = session;
		this._metaToolbar.context = session;
		this._statusIcon.reset();

		const store = new DisposableStore();
		this._sessionDisposables.value = store;

		if (!session) {
			this._setVisible(false);
			return;
		}

		store.add(autorun(reader => {
			this._updateHeader(session, reader);
		}));

		store.add(autorun(reader => {
			this._setVisible(session.isCreated.read(reader));
		}));
	}

	private _updateHeader(session: IActiveSession, reader: IReader): void {
		// Session icon — the SessionStatusIcon widget owns the rendering (spinner vs.
		// codicon, cross-fade, reduced-motion); here we just feed it the latest state.
		// The pull request is surfaced in the metadata row, so terminal/default states
		// use the read/unread dot indicator (no session type or PR icon).
		const status = session.status.read(reader);
		const isRead = session.isRead.read(reader);
		const isArchived = session.isArchived.read(reader);
		this._statusIcon.setStatus(status, isRead, isArchived);

		// Metadata: contributed action pills (workspace folder · diff stats · pull request).
		// Reading the signal re-runs this on menu changes.
		this._metaActionsSignal.read(reader);
		const hasMetaActions = !this._metaToolbar.isEmpty();

		this._metaRow.style.display = hasMetaActions ? '' : 'none';
		this._onDidChangeHeight.fire();
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
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
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
