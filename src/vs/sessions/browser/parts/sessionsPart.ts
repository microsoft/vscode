/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPart.css';
import { triggerConfettiAnimation } from '../../../base/browser/ui/animations/animations.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { localize } from '../../../nls.js';
import { agentsPanelBorder } from '../../common/theme.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { Direction, ISerializedGrid, ISerializedNode } from '../../../base/browser/ui/grid/grid.js';
import { Part } from '../../../workbench/browser/part.js';
import { ActiveSessionsContext, MultipleSessionsVisibleContext, SessionsFocusContext } from '../../common/contextkeys.js';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isAncestor, isAncestorOfActiveElement, isHTMLElement, trackFocus } from '../../../base/browser/dom.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { SessionView } from './sessionView.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Color } from '../../../base/common/color.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { SessionDropTarget, ISessionDropTargetDelegate } from './sessionDropTarget.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { defaultProgressBarStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../workbench/services/progress/browser/progressIndicator.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { applyAgentsPartCardStyles, getAgentsPartCardContentSize } from './agentsPartCard.js';
import { isPhoneLayout } from './mobile/mobileLayout.js';
import { SessionsChatBackgroundRenderer } from '../../services/chatBackground/browser/chatBackgroundRenderer.js';
import { ISessionsChatBackgroundService } from '../../services/chatBackground/browser/chatBackgroundService.js';
import { noSessionPickerVisibility, SessionPickerVisibilityContextKeys } from '../../services/sessions/common/sessionPickerVisibility.js';
import { ISessionGridPlacement, ISessionGridSlot, MAIN_SESSIONS_PART, SessionGridRequest } from '../../services/sessions/browser/sessionsPartService.js';
import { SessionGridLayout } from './sessionGridLayout.js';
import { IChatGroupsTransferState } from './chatGroupsView.js';
import { setActiveSessionContextKeys } from '../../services/sessions/common/sessionContextKeys.js';
import { isSessionGridLeafData } from '../../services/sessions/browser/sessionGridState.js';

interface IGridSlot {
	readonly id: string;
	readonly view: SessionView;
	readonly disposables: DisposableStore;
	/** Session currently bound to this slot, or `undefined` for the new-session placeholder. */
	boundSessionId: string | undefined;
	session?: IActiveSession;
	placement?: ISessionGridPlacement;
}

type CodiconConfettiActivationEvent = {};

type CodiconConfettiActivationClassification = {
	owner: 'tyleonha';
	comment: 'Tracks how often users discover and activate the Codicon background confetti button.';
};

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
	private readonly _activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	readonly activeSession = this._activeSession;

	private readonly _onDidFocusSession = this._register(new Emitter<string | undefined>());
	/** Fired when a session view in the grid receives keyboard focus. */
	readonly onDidFocusSession: Event<string | undefined> = this._onDidFocusSession.event;

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
		readonly partId: string,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IAgentWorkbenchLayoutService private readonly agentWorkbenchLayoutService: IAgentWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsChatBackgroundService private readonly chatBackgroundService: ISessionsChatBackgroundService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(
			partId === MAIN_SESSIONS_PART ? Parts.SESSIONS_PART : `workbench.parts.sessions.${partId}`,
			{ hasTitle: false, borderWidth: () => 0 },
			themeService,
			storageService,
			agentWorkbenchLayoutService
		);

		// Bind context keys for compatibility with existing when-clauses
		ActiveSessionsContext.bindTo(contextKeyService);
		this._sessionsFocusKey = SessionsFocusContext.bindTo(contextKeyService);
		this._multipleSessionsVisibleKey = MultipleSessionsVisibleContext.bindTo(contextKeyService);
		this._pickerVisibilityContextKeys = this._register(new SessionPickerVisibilityContextKeys(contextKeyService));
		if (!this.isMain) {
			this._register(autorun(reader => setActiveSessionContextKeys(this.activeSession.read(reader), contextKeyService, reader)));
		}
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		parent.classList.add('sessionspart');

		super.create(parent);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		const backgroundRenderer = this._register(new SessionsChatBackgroundRenderer(parent, true));
		this._register(backgroundRenderer.onDidActivateCodicon(element => this.activateCodicon(element)));
		const updateBackground = () => backgroundRenderer.setBackground(this.chatBackgroundService.getBackground());
		this._register(this.chatBackgroundService.onDidChangeBackground(updateBackground));
		updateBackground();

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

		this._gridWidget = this._register(new SessionGridLayout());
		this._gridWidget.style({ separatorBorder: this._gridSeparatorBorder });
		contentArea.appendChild(this._gridWidget.element);
		if (this.isMain) {
			const placeholder = this._createSlot('initial');
			this._gridWidget.reconcile([{ id: placeholder.id, view: placeholder.view }], placeholder.id);
			this._slots.push(placeholder);
		}

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
			partId: this.partId,
			findTargetView: (child: HTMLElement) => this.findDropTarget(child),
		};
		this._register(this.instantiationService.createInstance(SessionDropTarget, contentArea, dropDelegate));

		return contentArea;
	}

	get isMain(): boolean { return this.partId === MAIN_SESSIONS_PART; }

	private activateCodicon(element: HTMLElement): void {
		if (!this.accessibilityService.isMotionReduced()) {
			triggerConfettiAnimation(element);
		}
		this.accessibilityService.status(localize('sessionsChatBackground.confetti', "Confetti!"));
		this.telemetryService.publicLog2<CodiconConfettiActivationEvent, CodiconConfettiActivationClassification>('vscodeAgents.codiconBackground/confetti', {});
	}

	findDropTarget(child: Element): { readonly sessionId: string | undefined; readonly element: HTMLElement } | undefined {
		for (const slot of this._slots) {
			if (isAncestor(child, slot.view.element)) {
				return { sessionId: slot.boundSessionId, element: slot.view.element };
			}
		}
		if (!this._slots.length && this.contentArea && isAncestor(child, this.contentArea)) {
			return { sessionId: undefined, element: this.contentArea };
		}
		return undefined;
	}

	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined, gridSlots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void {
		if (!this._gridWidget) {
			return;
		}

		// Rebinding or disposing the old slot must not publish an intermediate active-view state.
		this._activeViewPickerVisibility.clear();

		const sessions = visible.length || !this.isMain ? visible : [undefined];
		const oldSlots = new Map(this._slots.map(slot => [slot.id, slot]));
		const created: IGridSlot[] = [];
		let next: IGridSlot[];
		try {
			next = sessions.map((session, index) => {
				const id = gridSlots?.[index].id ?? session?.sessionId ?? 'initial';
				let slot = oldSlots.get(id);
				if (!slot) {
					slot = this._createSlot(id);
					created.push(slot);
				}
				oldSlots.delete(id);
				slot.boundSessionId = session?.sessionId;
				slot.session = session;
				slot.placement = gridSlots?.[index].placement;
				slot.view.openSession(session, {});
				return slot;
			});
		} catch (error) {
			for (const slot of created) {
				slot.disposables.dispose();
			}
			throw error;
		}
		this._slots.splice(0, this._slots.length, ...next);
		this._activeSession.set(active, undefined);

		// Mark the active session's element for styling/focus indication.
		const activeId = active?.sessionId;
		const activeSlot = this._slots.find(slot => slot.boundSessionId === activeId)
			?? (this._slots.length === 1 ? this._slots[0] : undefined);
		for (const slot of this._slots) {
			const isActive = slot === activeSlot;
			slot.view.element.classList.toggle('is-active', isActive);
			slot.view.setActive(isActive);
		}

		this._gridWidget.reconcile(next.map((slot, index) => ({ id: slot.id, view: slot.view, placement: gridSlots?.[index].placement })), activeSlot?.id ?? next[0]?.id);
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

		this._updateContextKeys(visible);
		this._activeViewPickerVisibility.value = autorun(reader => {
			this._pickerVisibilityContextKeys.set(activeSlot?.view.pickerVisibility.read(reader) ?? noSessionPickerVisibility);
		});
	}

	captureSessionState(sessionId: string): { readonly id: string; readonly state: IChatGroupsTransferState; readonly placement?: ISessionGridPlacement } {
		const index = this._slots.findIndex(slot => slot.boundSessionId === sessionId);
		if (index < 0) {
			throw new Error(`Session '${sessionId}' is not mounted in part '${this.partId}'`);
		}
		const slot = this._slots[index];
		return { id: slot.id, state: slot.view.captureTransferState(), placement: slot.placement };
	}

	releaseSessionView(sessionId: string): void {
		const index = this._slots.findIndex(slot => slot.boundSessionId === sessionId);
		if (index < 0) {
			throw new Error(`Session '${sessionId}' is not mounted in part '${this.partId}'`);
		}
		const slot = this._slots[index];
		this._activeViewPickerVisibility.clear();
		this._slots.splice(index, 1);
		this._gridWidget?.remove(slot.id);
		slot.disposables.dispose();
	}

	restoreSessionView(id: string, session: IActiveSession, state: IChatGroupsTransferState, placement?: ISessionGridPlacement): void {
		const slot = this._createSlot(id);
		try {
			slot.boundSessionId = session.sessionId;
			slot.session = session;
			slot.placement = placement;
			slot.view.openSession(session, { transferState: state });
			this._slots.push(slot);
		} catch (error) {
			slot.disposables.dispose();
			throw error;
		}
	}

	restoreGridLayout(grid: ISerializedGrid): void {
		const ids: string[] = [];
		const collect = (node: ISerializedNode): void => {
			if (node.type === 'branch') {
				node.data.forEach(collect);
			} else if (isSessionGridLeafData(node.data)) {
				ids.push(node.data.id);
			}
		};
		collect(grid.root);
		this._slots.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
		this.updateVisibleSessions(this._slots.map(slot => slot.session), this.activeSession.get(), this._slots.map(slot => ({ id: slot.id, placement: slot.placement })), { type: 'restore', grid });
	}

	flushState(): void {
		for (const slot of this._slots) {
			slot.view.saveState();
		}
	}

	getTransferVeto(): string | undefined {
		for (const slot of this._slots) {
			const veto = slot.view.getTransferVeto();
			if (veto) {
				return veto;
			}
		}
		return undefined;
	}

	private _updateContextKeys(visible: readonly (IActiveSession | undefined)[]): void {
		this._multipleSessionsVisibleKey.set(visible.length > 1);
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
	 * Toggles the maximized state of the session view hosting the given session.
	 * If the view is already maximized, exits maximized state. Otherwise maximizes
	 * it (no-op if fewer than two non-placeholder views are present).
	 *
	 * Returns the view's maximized state after the toggle, or `undefined` when
	 * the call was a no-op.
	 */
	toggleMaximizeSession(sessionId: string | undefined): boolean | undefined {
		if (!this._gridWidget) {
			return undefined;
		}
		const slot = this._slots.find(s => s.boundSessionId === sessionId);
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

	getNeighborSession(sessionId: string | undefined, direction: Direction): IActiveSession | null | undefined {
		const slot = this._slots.find(slot => slot.boundSessionId === sessionId);
		const neighbor = slot && this._gridWidget?.neighbor(slot.id, direction);
		const target = this._slots.find(slot => slot.id === neighbor);
		return target ? target.session ?? null : undefined;
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
		const slot = this._slots.find(slot => slot.boundSessionId === sessionId);
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
		return this._slots.find(s => s.boundSessionId === sessionId)?.view;
	}

	getFocusedSessionView(): SessionView | undefined {
		return this._slots.find(slot => isAncestorOfActiveElement(slot.view.element))?.view;
	}

	/**
	 * Moves keyboard focus into the session view hosting the given session id (or
	 * the placeholder view when `sessionId` is `undefined`), first revealing it in
	 * the grid when it is only partially visible. No-op if no matching slot exists.
	 */
	focusSession(sessionId: string | undefined): void {
		const slot = this._slots.find(s => s.boundSessionId === sessionId);
		if (!slot) {
			return;
		}
		this._revealView(slot.view);
		slot.view.focus();
	}

	focusSelectedSession(): void {
		const selected = this._slots.find(slot => slot.session === this.activeSession.get()) ?? this._slots[0];
		if (selected) {
			this._revealView(selected.view);
			selected.view.focus();
		}
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
			const scopeId = this.getId();
			const isVisible = this.isMain ? this.layoutService.isVisible(Parts.SESSIONS_PART) : this._isPartVisible;
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
		const view = disposables.add(this.instantiationService.createInstance(SessionView, assertReturnsDefined(this._gridWidget).element));
		view.setPartVisible(this._sessionViewsVisible);
		const slot: IGridSlot = { id, view, disposables, boundSessionId: undefined };
		// Pointer-down also activates non-focusable chrome and the empty new-session slot.
		const fireFocus = () => {
			this._restoreSessionOnActivation(slot);
			this._onDidFocusSession.fire(slot.boundSessionId);
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
		return this.theme.getColor(agentsPanelBorder) || this.theme.getColor(contrastBorder) || Color.transparent;
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
		if (this.isMain && !this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		const cardSize = getAgentsPartCardContentSize(
			width,
			height,
			this.isMain && this.agentWorkbenchLayoutService.isEditorPaneVisible(),
			this.isMain && this.layoutService.isVisible(Parts.SIDEBAR_PART),
			this.isMain && isPhoneLayout(this.layoutService)
		);

		// Size the content area with the reduced dimensions.
		const { contentSize } = this.layoutContents(cardSize.width, cardSize.height);

		// Layout the internal grid widget within the content area.
		this._gridWidget?.layout(contentSize.width, contentSize.height, top, left, this.isMain && isPhoneLayout(this.layoutService));

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
