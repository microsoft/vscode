/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPart.css';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { agentsPanelBorder } from '../../common/theme.js';
import { Parts, IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { LayoutPriority } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Direction, ISerializedGrid } from '../../../../../base/browser/ui/grid/grid.js';
import { Part } from '../../../../browser/part.js';
import { ActiveSessionsContext, MultipleSessionsVisibleContext, SessionsFocusContext } from '../../common/contextkeys.js';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isAncestor, isAncestorOfActiveElement, isHTMLElement, trackFocus } from '../../../../../base/browser/dom.js';
import { SessionView } from './sessionView.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableSignal } from '../../../../../base/common/observable.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Color } from '../../../../../base/common/color.js';
import { contrastBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { SessionDropTarget, ISessionDropTargetDelegate } from './sessionDropTarget.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { defaultProgressBarStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IProgressIndicator } from '../../../../../platform/progress/common/progress.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../../services/progress/browser/progressIndicator.js';
import { applyAgentsPartCardStyles, getAgentsPartCardContentSize, getSessionsPartCardMarginRight } from './agentsPartCard.js';
import { isPhoneLayout } from '../mobileLayout.js';
import { SessionsChatSurface } from '../sessionsChatSurface.js';
import { noSessionPickerVisibility, SessionPickerVisibilityContextKeys } from '../../common/sessionPickerVisibility.js';
import { ISessionGridSlot, SessionGridRequest } from '../sessionsPartService.js';
import { ISessionGridPane, SessionGridPaneKind } from '../sessionGridPane.js';
import type { ISessionHost } from '../sessionHost.js';
import { SessionGridLayout } from './sessionGridLayout.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../common/layoutConstants.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISessionsHostLayoutService } from '../sessionsHostLayoutService.js';

interface IGridSlot {
	readonly id: string;
	readonly view: SessionView;
	readonly disposables: DisposableStore;
	/** Session currently bound to this slot, or `undefined` for the new-session placeholder. */
	boundSessionId: string | undefined;
	/** The pane of the grid the slot shows. */
	pane?: ISessionGridPane;
}

/** Whether `slot` shows one chat of its session apart from the session's slot. */
function isDetachedSlot(slot: IGridSlot): boolean {
	return slot.pane?.kind === SessionGridPaneKind.Detached;
}

/** The chat a detached pane of the grid shows, by which it is told apart from the session's slot. */
function detachedChatOf(slot: IGridSlot): URI | undefined {
	return slot.pane?.kind === SessionGridPaneKind.Detached ? slot.pane.chat.get()?.resource : undefined;
}

export class SessionsPart extends Part {

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	get snap(): boolean { return false; }

	/** Border width on the card (1px each side) */
	static readonly BORDER_WIDTH = 1;

	/** Internal grid that hosts the part's session views. */
	protected _gridWidget: SessionGridLayout | undefined;
	private _gridRequest: SessionGridRequest | undefined;
	private readonly _onDidInteractWithGrid = this._register(new Emitter<void>());
	readonly onDidInteractWithGrid = this._onDidInteractWithGrid.event;

	/** Lazily-created progress bar shown at the top of the content area. */
	private _progressBar: ProgressBar | undefined;
	private _progressIndicator: IProgressIndicator | undefined;

	/** Stable model slots in depth-first grid order, including the empty composer. */
	private readonly _slots: IGridSlot[] = [];
	private _activeSlot: IGridSlot | undefined;
	private readonly _slotsChanged = observableSignal(this);
	readonly shownChatCount = derived(this, reader => {
		this._slotsChanged.read(reader);
		return this._slots.reduce((count, slot) => count + slot.view.shownChatCount.read(reader), 0);
	});

	private readonly _onDidFocusPane = this._register(new Emitter<string>());
	/** Fired with the slot id of a view of the grid that receives keyboard focus. */
	readonly onDidFocusPane: Event<string> = this._onDidFocusPane.event;

	protected _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	private readonly _multipleSessionsVisibleKey: IContextKey<boolean>;
	private readonly _sessionsFocusKey: IContextKey<boolean>;
	private readonly _pickerVisibilityContextKeys: SessionPickerVisibilityContextKeys;
	private readonly _activeViewPickerVisibility = this._register(new MutableDisposable());

	/**
	 * Whether the part itself is visible in the workbench grid. Starts `true`
	 * because the workbench grid only calls {@link setVisible} on change.
	 */
	private _isPartVisible = true;

	/** Whether the workbench permits the mounted session views to render. */
	private _contentVisible = true;

	private get _sessionViewsVisible(): boolean {
		return this._isPartVisible && this._contentVisible;
	}

	get preferredHeight(): number | undefined {
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	readonly priority = LayoutPriority.High;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ISessionsHostLayoutService private readonly hostLayoutService: ISessionsHostLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(
			Parts.SESSIONS_PART,
			{ hasTitle: false, borderWidth: () => 0 },
			themeService,
			storageService,
			layoutService
		);

		// Bind context keys for compatibility with existing when-clauses
		ActiveSessionsContext.bindTo(contextKeyService);
		this._sessionsFocusKey = SessionsFocusContext.bindTo(contextKeyService);
		this._multipleSessionsVisibleKey = MultipleSessionsVisibleContext.bindTo(contextKeyService);
		this._pickerVisibilityContextKeys = this._register(new SessionPickerVisibilityContextKeys(contextKeyService));
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		parent.classList.add('sessionspart');

		super.create(parent);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this._register(this.instantiationService.createInstance(SessionsChatSurface, parent));

		const contentArea = $('.content');
		parent.appendChild(contentArea);

		// Track keyboard focus within the sessions content so the `sessionsFocus`
		// context key reflects whether a session (its chat view) currently has focus.
		const focusTracker = this._register(trackFocus(contentArea));
		this._register(focusTracker.onDidFocus(() => this._sessionsFocusKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this._sessionsFocusKey.set(false)));

		// Progress bar pinned to the top of the content area (see sessionsPart.css
		// rule `.part.sessionspart > .content > .monaco-progress-container`).
		this._progressBar = this._register(new ProgressBar(contentArea, defaultProgressBarStyles));
		this._progressBar.hide();

		// Seed the grid with a placeholder slot so SerializableGrid always has
		// at least one leaf. Rebound to a session when visible sessions appear.
		const placeholder = this._createSlot('initial');
		this._gridWidget = this._register(new SessionGridLayout());
		this._gridWidget.style({ separatorBorder: this._gridSeparatorBorder });
		this._gridWidget.reconcile([{ id: placeholder.id, view: placeholder.view }], placeholder.id);
		this._slots.push(placeholder);
		this._slotsChanged.trigger(undefined);
		contentArea.appendChild(this._gridWidget.element);

		// Propagate the grid's maximized-view state to each session view so the
		// per-view toolbars can render the maximize action in its toggled state.
		this._register(this._gridWidget.onDidChangeMaximized(() => this._updateMaximizedState()));
		this._register(addDisposableListener(this._gridWidget.element, EventType.POINTER_DOWN, event => {
			if (isHTMLElement(event.target) && event.target.closest('.monaco-sash')) {
				this._onDidInteractWithGrid.fire();
			}
		}));

		// Drop target for receiving sessions dragged from the sessions list.
		const dropDelegate: ISessionDropTargetDelegate = {
			findTargetView: (child: HTMLElement) => this._findTargetView(child),
		};
		this._register(this.instantiationService.createInstance(SessionDropTarget, contentArea, dropDelegate));

		return contentArea;
	}

	private _findTargetView(child: HTMLElement): { readonly sessionId: string | undefined; readonly gridSlotId: string; readonly chatResource?: URI; readonly element: HTMLElement } | undefined {
		for (const slot of this._slots) {
			if (isAncestor(child, slot.view.element)) {
				return { sessionId: slot.boundSessionId, gridSlotId: slot.id, chatResource: detachedChatOf(slot), element: slot.view.element };
			}
		}
		return undefined;
	}

	/**
	 * Renders the panes of the grid, in the order of `gridSlots`, with `activePane` active: the view of each pane's grid slot
	 * shows that pane, and binds again to its session as the pane shows another, such as a replacement of it.
	 */
	updatePanes(panes: readonly ISessionGridPane[], activePane: ISessionGridPane | undefined, gridSlots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void {
		this._reconcile(panes.map(pane => ({
			id: pane.id,
			sessionId: pane.session.get()?.sessionId,
			pane,
			open: view => view.openPane(pane, {}),
		})), slots => slots.find(slot => slot.pane === activePane), gridSlots, request);
	}

	private _reconcile(entries: readonly { readonly id: string; readonly sessionId: string | undefined; readonly pane?: ISessionGridPane; readonly open: (view: SessionView) => void }[], findActive: (slots: readonly IGridSlot[]) => IGridSlot | undefined, gridSlots: readonly ISessionGridSlot[] | undefined, request: SessionGridRequest | undefined): void {
		if (!this._gridWidget) {
			return;
		}

		// Rebinding or disposing the old slot must not publish an intermediate active-view state.
		this._activeViewPickerVisibility.clear();

		const oldSlots = new Map(this._slots.map(slot => [slot.id, slot]));
		const next = entries.map(entry => {
			const slot = oldSlots.get(entry.id) ?? this._createSlot(entry.id);
			oldSlots.delete(entry.id);
			slot.boundSessionId = entry.sessionId;
			slot.pane = entry.pane;
			entry.open(slot.view);
			return slot;
		});
		this._slots.splice(0, this._slots.length, ...next);
		this._slotsChanged.trigger(undefined);

		// Mark the active session's element for styling/focus indication.
		const activeSlot = findActive(this._slots) ?? (this._slots.length === 1 ? this._slots[0] : undefined);
		this._activeSlot = activeSlot;
		for (const slot of this._slots) {
			const isActive = slot === activeSlot;
			slot.view.element.classList.toggle('is-active', isActive);
			slot.view.setActive(isActive);
		}

		this._gridWidget.reconcile(next.map((slot, index) => ({ id: slot.id, view: slot.view, placement: gridSlots?.[index].placement })), activeSlot?.id ?? next[0].id);
		for (const slot of oldSlots.values()) {
			slot.disposables.dispose();
		}
		if (request && request !== this._gridRequest) {
			this._gridRequest = request;
			if (request.type === 'arrange') {
				this._gridWidget.arrange();
			} else {
				this._gridWidget.restore(request.grid);
			}
		}
		this._updateMaximizedState();
		if (this._lastLayout) {
			const { width, height, top, left } = this._lastLayout;
			this.layout(width, height, top, left);
		}

		this._updateContextKeys(entries.length);
		this._activeViewPickerVisibility.value = autorun(reader => {
			this._pickerVisibilityContextKeys.set(activeSlot?.view.pickerVisibility.read(reader) ?? noSessionPickerVisibility);
		});
	}

	private _updateContextKeys(paneCount: number): void {
		this._multipleSessionsVisibleKey.set(paneCount > 1);
	}

	/**
	 * Pushes the grid's current maximized state into each {@link SessionView} so
	 * its scoped `sessionIsMaximized` context key (used by toolbar actions) is
	 * accurate. Called whenever the grid emits a maximize change.
	 */
	private _updateMaximizedState(): void {
		if (!this._gridWidget) {
			return;
		}
		for (const slot of this._slots) {
			slot.view.setMaximized(this._gridWidget.maximized === slot.id);
		}
	}

	/**
	 * Toggles the maximized state of the view of `pane`. If the view is already maximized, exits maximized state. Otherwise
	 * maximizes it (no-op if fewer than two non-placeholder views are present).
	 *
	 * Returns the view's maximized state after the toggle, or `undefined` when the call was a no-op.
	 */
	toggleMaximizePane(pane: ISessionGridPane): boolean | undefined {
		return this._toggleMaximized(this._slots.find(slot => slot.id === pane.id));
	}

	private _toggleMaximized(slot: IGridSlot | undefined): boolean | undefined {
		if (!this._gridWidget) {
			return undefined;
		}
		if (!slot) {
			return undefined;
		}
		const maximized = this._gridWidget.toggleMaximized(slot.id);
		if (maximized !== undefined) {
			this._onDidInteractWithGrid.fire();
			slot.view.focus();
		}
		return maximized;
	}

	getGridLayout(): ISerializedGrid | undefined { return this._gridWidget?.serialize(); }

	/** The pane at `index` in visual grid order (`-1` for the last), or `undefined` if there is none. */
	getPaneAtPosition(index: number): ISessionGridPane | undefined {
		const id = this._gridWidget?.order.at(index);
		return this._slots.find(slot => slot.id === id)?.pane;
	}

	/** The pane next to `pane` in `direction`, or `undefined` if there is none. */
	getNeighborPane(pane: ISessionGridPane, direction: Direction): ISessionGridPane | undefined {
		const neighbor = this._gridWidget?.neighbor(pane.id, direction);
		return this._slots.find(slot => slot.id === neighbor)?.pane;
	}

	/** The view of the grid slot of `pane`. */
	getViewOfPane(pane: ISessionGridPane): SessionView | undefined {
		return this._slots.find(slot => slot.id === pane.id)?.view;
	}

	getSessionPlacement(sessionId: string): { sessionId: string | undefined; direction: Direction } | undefined {
		const slot = this._slots.find(slot => slot.boundSessionId === sessionId);
		if (slot) {
			const placement = this._gridWidget?.placement(slot.id);
			const reference = this._slots.find(slot => slot.id === placement?.reference);
			if (reference && placement) {
				return { sessionId: reference.boundSessionId, direction: placement.direction };
			}
		}
		return undefined;
	}

	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void {
		this._resize(this._findSessionSlot(sessionId), direction, amount);
	}

	/** Resizes the view of `pane` by `amount` in `direction`. */
	resizePane(pane: ISessionGridPane, direction: Direction, amount: number): void {
		this._resize(this._slots.find(slot => slot.id === pane.id), direction, amount);
	}

	private _resize(slot: IGridSlot | undefined, direction: Direction, amount: number): void {
		const size = slot && this._gridWidget?.getSize(slot.id);
		if (slot && size) {
			this._onDidInteractWithGrid.fire();
			const horizontal = direction === Direction.Left || direction === Direction.Right;
			const delta = direction === Direction.Left || direction === Direction.Up ? -amount : amount;
			this._gridWidget?.resize(slot.id, size.width + (horizontal ? delta : 0), size.height + (horizontal ? 0 : delta));
		}
	}

	/**
	 * Returns the {@link SessionView} currently hosting the given session id, or
	 * the placeholder (new-session) view when `sessionId` is `undefined`. Returns
	 * `undefined` if no matching slot exists in the grid.
	 */
	getSessionView(sessionId: string | undefined): SessionView | undefined {
		return this._findSessionSlot(sessionId)?.view;
	}

	private _findSessionSlot(sessionId: string | undefined): IGridSlot | undefined {
		return this._slots.find(slot => slot.boundSessionId === sessionId && slot.view.element.classList.contains('is-active'))
			?? this._slots.find(slot => slot.boundSessionId === sessionId && !isDetachedSlot(slot));
	}

	getFocusedSessionView(): SessionView | undefined {
		return this._slots.find(slot => isAncestorOfActiveElement(slot.view.element))?.view;
	}

	/** The view of a slot or detached pane whose host is `host`. */
	getSessionViewOfHost(host: ISessionHost): SessionView | undefined {
		return this._slots.find(slot => slot.view.host === host)?.view;
	}

	/** The id of the grid slot whose view's host is `host`. */
	getPaneIdOfHost(host: ISessionHost): string | undefined {
		return this._slots.find(slot => slot.view.host === host)?.id;
	}

	getActiveSessionView(): SessionView | undefined {
		return this._activeSlot && this._slots.includes(this._activeSlot) ? this._activeSlot.view : undefined;
	}

	/**
	 * Moves keyboard focus into the placeholder (new-session) view, first revealing it in the grid when it is only
	 * partially visible. No-op if no new-session slot exists.
	 */
	focusNewSessionSlot(): void {
		const slot = this._slots.find(s => s.boundSessionId === undefined && !detachedChatOf(s));
		if (!slot) {
			return;
		}
		this._revealView(slot.view);
		slot.view.focus();
	}

	/** Moves keyboard focus into the view of the grid slot `id`, first revealing it like {@link focusNewSessionSlot}. No-op without one. */
	focusPane(id: string): void {
		const slot = this._slots.find(candidate => candidate.id === id);
		if (!slot) {
			return;
		}
		this._revealView(slot.view);
		slot.view.focus();
	}

	/** Moves keyboard focus into the view whose host is `host`, of those the grid shows, first revealing it like {@link focusNewSessionSlot}. */
	focusViewOfHost(host: ISessionHost): void {
		const slot = this._slots.find(candidate => candidate.view.host === host);
		if (!slot) {
			return;
		}
		this._revealView(slot.view);
		slot.view.focus();
	}

	/**
	 * Ensures the given view is fully visible within the grid. The grid clips its
	 * leaves (`overflow: hidden`) and lays them out side by side; when there are
	 * more sessions than fit, the grid's split view overflows horizontally and
	 * becomes scrollable, leaving views near the edges partially hidden. When the
	 * target view is not fully visible, scroll it into view.
	 */
	private _revealView(view: SessionView): void {
		if (!this._gridWidget) {
			return;
		}
		const containerRect = this._gridWidget.element.getBoundingClientRect();
		const viewRect = view.element.getBoundingClientRect();
		const isFullyVisible = viewRect.left >= containerRect.left - 1 && viewRect.right <= containerRect.right + 1
			&& viewRect.top >= containerRect.top - 1 && viewRect.bottom <= containerRect.bottom + 1;
		if (!isFullyVisible) {
			view.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	}

	/**
	 * Returns the progress indicator for the part. Drives the progress bar shown
	 * at the top of the content area. Indicator state is scoped to the part's
	 * visibility, mirroring how view panes manage their own progress indicators.
	 */
	getProgressIndicator(): IProgressIndicator {
		if (!this._progressIndicator) {
			const progressBar = assertReturnsDefined(this._progressBar);
			const scopeId = Parts.SESSIONS_PART;
			const isVisible = this.layoutService.isVisible(scopeId);
			const onDidVisibilityChange = this.onDidVisibilityChange;
			const scope = this._register(new class extends AbstractProgressScope {
				constructor() {
					super(scopeId, isVisible);
					this._register(onDidVisibilityChange(visible => visible ? this.onScopeOpened(scopeId) : this.onScopeClosed(scopeId)));
				}
			}());
			this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
		}
		return this._progressIndicator;
	}

	private _createSlot(id: string): IGridSlot {
		const disposables = new DisposableStore();
		const view = disposables.add(this.instantiationService.createInstance(SessionView, undefined));
		view.setPartVisible(this._sessionViewsVisible);
		const slot: IGridSlot = { id, view, disposables, boundSessionId: undefined };
		// Pointer-down also activates non-focusable chrome and the empty new-session slot.
		const fireFocus = () => {
			this._restoreSessionOnActivation(slot);
			this._onDidFocusPane.fire(slot.id);
		};
		disposables.add(addDisposableListener(view.element, EventType.FOCUS_IN, fireFocus, true));
		disposables.add(addDisposableGenericMouseDownListener(view.element, fireFocus, true));
		return slot;
	}

	private _restoreSessionOnActivation(slot: IGridSlot): void {
		if (!this._gridWidget) {
			return;
		}

		this._gridWidget.expand(slot.id);
	}

	private get _gridSeparatorBorder(): Color {
		const contrast = this.theme.getColor(contrastBorder);
		return contrast && !contrast.isTransparent() ? contrast : this.theme.getColor(agentsPanelBorder)?.transparent(0.5) || Color.transparent;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		applyAgentsPartCardStyles(container, this.theme);

		this._gridWidget?.style({ separatorBorder: this._gridSeparatorBorder });
	}

	setContentVisible(visible: boolean): void {
		if (this._contentVisible === visible) {
			return;
		}

		this._contentVisible = visible;
		this._updateSessionViewsVisibility();
	}

	private _updateSessionViewsVisibility(): void {
		const visible = this._sessionViewsVisible;
		for (const slot of this._slots) {
			slot.view.setPartVisible(visible);
		}
	}

	override setVisible(visible: boolean): void {
		if (this._isPartVisible !== visible) {
			// Update before `super`, whose event re-enters this method.
			this._isPartVisible = visible;
			this._updateSessionViewsVisibility();
		}

		super.setVisible(visible);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		const phoneLayout = isPhoneLayout(this.layoutService);
		const compactLayout = this.layoutService.isModernUICompact();
		const cardSize = getAgentsPartCardContentSize(
			width,
			height,
			(this.hostLayoutService.sidePane?.isEditorPaneVisible() ?? false),
			this.layoutService.isVisible(Parts.SIDEBAR_PART),
			phoneLayout,
			compactLayout,
			getSessionsPartCardMarginRight(this.layoutService.mainContainer)
		);

		// Size the content area with the reduced dimensions.
		const { contentSize } = this.layoutContents(cardSize.width, cardSize.height);

		// Layout the internal grid widget within the content area.
		const gridGap = phoneLayout || compactLayout ? 0 : AGENTS_FLOATING_PANEL_GAP;
		this._gridWidget?.layout(contentSize.width, contentSize.height, top, left, phoneLayout, gridGap);

		// Store the full grid-allocated dimensions so that Part.relayout() works correctly.
		super.layout(width, height, top, left);
	}

	override dispose(): void {
		this._activeViewPickerVisibility.clear();
		for (const slot of this._slots) {
			slot.disposables.dispose();
		}
		this._slots.length = 0;
		super.dispose();
	}

	toJSON(): object {
		return {
			type: Parts.SESSIONS_PART
		};
	}
}
