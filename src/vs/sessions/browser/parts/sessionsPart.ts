/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPart.css';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { agentsPanelBackground, agentsPanelBorder, agentsPanelForeground } from '../../common/theme.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { Direction, SerializableGrid, Sizing } from '../../../base/browser/ui/grid/grid.js';
import { Part } from '../../../workbench/browser/part.js';
import { ActiveSessionsContext, MultipleSessionsVisibleContext, SessionsFocusContext } from '../../common/contextkeys.js';
import { $, addDisposableListener, EventType, isAncestor } from '../../../base/browser/dom.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { SessionView } from './sessionView.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Color } from '../../../base/common/color.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { SessionDropTarget, ISessionDropTargetDelegate } from './sessionDropTarget.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { defaultProgressBarStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../workbench/services/progress/browser/progressIndicator.js';

/** Sentinel key used in {@link SessionsPart._views} when no session is active. */
const PLACEHOLDER_KEY = '__placeholder__';

interface IGridSlot {
	readonly view: SessionView;
	readonly disposables: DisposableStore;
}

export class SessionsPart extends Part {

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	get snap(): boolean { return false; }

	/** Visual margin values for the card-like appearance */
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_LEFT = 10;
	static readonly MARGIN_RIGHT = 5;
	static readonly MARGIN_BOTTOM = 5;

	/** Border width on the card (1px each side) */
	static readonly BORDER_WIDTH = 1;

	/** Internal grid that hosts the part's session views. */
	protected _gridWidget: SerializableGrid<SessionView> | undefined;

	/** Lazily-created progress bar shown at the top of the content area. */
	private _progressBar: ProgressBar | undefined;
	private _progressIndicator: IProgressIndicator | undefined;

	/**
	 * Views currently mounted in the grid, in display order (left-to-right).
	 * The first entry is always a placeholder view (key {@link PLACEHOLDER_KEY})
	 * when no sessions are visible. Otherwise entries are keyed by session id.
	 */
	private readonly _views = new Map<string, IGridSlot>();
	/** Grid order — keys of {@link _views} in left-to-right order. */
	private _gridOrder: string[] = [];

	private readonly _onDidFocusSession = this._register(new Emitter<string>());
	/** Fired when a session view in the grid receives keyboard focus. */
	readonly onDidFocusSession: Event<string> = this._onDidFocusSession.event;

	protected _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	private readonly _multipleSessionsVisibleKey: IContextKey<boolean>;

	get preferredHeight(): number | undefined {
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	readonly priority = LayoutPriority.Normal;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
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
		SessionsFocusContext.bindTo(contextKeyService);
		this._multipleSessionsVisibleKey = MultipleSessionsVisibleContext.bindTo(contextKeyService);
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		parent.classList.add('sessionspart');

		super.create(parent);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		const contentArea = $('.content');
		parent.appendChild(contentArea);

		// Progress bar pinned to the top of the content area (see sessionsPart.css
		// rule `.part.sessionspart > .content > .monaco-progress-container`).
		this._progressBar = this._register(new ProgressBar(contentArea, defaultProgressBarStyles));
		this._progressBar.hide();

		// Seed the grid with a placeholder view so SerializableGrid always has
		// at least one leaf. Replaced when visible sessions become available.
		const placeholder = this._createSlot(PLACEHOLDER_KEY);
		this._gridWidget = this._register(new SerializableGrid(placeholder.view, { styles: { separatorBorder: this._gridSeparatorBorder } }));
		this._views.set(PLACEHOLDER_KEY, placeholder);
		this._gridOrder = [PLACEHOLDER_KEY];
		contentArea.appendChild(this._gridWidget.element);

		// Propagate the grid's maximized-view state to each session view so the
		// per-view toolbars can render the maximize action in its toggled state.
		this._register(this._gridWidget.onDidChangeViewMaximized(() => this._updateMaximizedState()));

		// Drop target for receiving sessions dragged from the sessions list.
		const dropDelegate: ISessionDropTargetDelegate = {
			findTargetView: (child: HTMLElement) => this._findTargetView(child),
		};
		this._register(this.instantiationService.createInstance(SessionDropTarget, contentArea, dropDelegate));

		return contentArea;
	}

	private _findTargetView(child: HTMLElement): { readonly sessionId: string; readonly element: HTMLElement } | undefined {
		for (const [key, slot] of this._views) {
			if (key === PLACEHOLDER_KEY) {
				continue;
			}
			if (isAncestor(child, slot.view.element)) {
				return { sessionId: key, element: slot.view.element };
			}
		}
		return undefined;
	}

	/**
	 * Reconcile the grid with the desired set of visible sessions. Creates a
	 * {@link SessionView} per session, removes views no longer in the visible
	 * list, reorders remaining views to match `visible`, and rebinds each view
	 * to its session.
	 */
	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined): void {
		if (!this._gridWidget) {
			return;
		}

		const desiredKeys: string[] = visible.length > 0
			? visible.map(s => s ? s.sessionId : PLACEHOLDER_KEY)
			: [PLACEHOLDER_KEY];
		const desiredKeySet = new Set(desiredKeys);

		// Add new views first so the grid never goes empty during reconciliation.
		// New views are appended to the right; they will be moved into the correct
		// position by the reorder pass below.
		for (const key of desiredKeys) {
			if (this._views.has(key)) {
				continue;
			}
			const slot = this._createSlot(key);
			const reference = this._views.get(this._gridOrder[this._gridOrder.length - 1])!.view;
			this._gridWidget.addView(slot.view, Sizing.Distribute, reference, Direction.Right);
			this._views.set(key, slot);
			this._gridOrder.push(key);
		}

		// Remove views no longer desired (always leaves at least one — desiredKeys
		// is non-empty because of the placeholder fallback).
		for (const key of [...this._gridOrder]) {
			if (desiredKeySet.has(key)) {
				continue;
			}
			const slot = this._views.get(key);
			if (!slot) {
				continue;
			}
			this._gridWidget.removeView(slot.view, Sizing.Distribute);
			slot.disposables.dispose();
			this._views.delete(key);
			this._gridOrder = this._gridOrder.filter(k => k !== key);
		}

		// Reorder remaining views to match `desiredKeys` left-to-right. After the
		// add/remove passes, `_gridOrder` contains exactly the desired keys but
		// possibly in the wrong order; move any out-of-place view next to its
		// already-positioned predecessor (or to the left of the first view at i=0).
		for (let i = 0; i < desiredKeys.length; i++) {
			const target = desiredKeys[i];
			if (this._gridOrder[i] === target) {
				continue;
			}
			const targetView = this._views.get(target)!.view;
			if (i === 0) {
				const refView = this._views.get(this._gridOrder[0])!.view;
				this._gridWidget.moveView(targetView, Sizing.Distribute, refView, Direction.Left);
			} else {
				const refView = this._views.get(this._gridOrder[i - 1])!.view;
				this._gridWidget.moveView(targetView, Sizing.Distribute, refView, Direction.Right);
			}
			this._gridOrder = this._gridOrder.filter(k => k !== target);
			this._gridOrder.splice(i, 0, target);
		}

		// Bind each remaining view to its session (or to undefined for placeholder).
		for (let i = 0; i < visible.length; i++) {
			const session = visible[i];
			if (session) {
				this._views.get(session.sessionId)?.view.openSession(session);
			} else {
				this._views.get(PLACEHOLDER_KEY)?.view.openSession(undefined);
			}
		}
		if (visible.length === 0) {
			this._views.get(PLACEHOLDER_KEY)?.view.openSession(undefined);
		}

		// Mark the active session's element for styling/focus indication.
		const activeId = active?.sessionId;
		for (const [key, slot] of this._views) {
			const isActive = key === activeId;
			slot.view.element.classList.toggle('is-active', isActive);
			slot.view.setActive(isActive);
		}

		this._updateContextKeys(visible);
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
		for (const slot of this._views.values()) {
			slot.view.setMaximized(this._gridWidget.isViewMaximized(slot.view));
		}
	}

	/**
	 * Toggles the maximized state of the session view hosting the given session.
	 * If the view is already maximized, exits maximized state. Otherwise maximizes
	 * it (no-op if fewer than two non-placeholder views are present).
	 */
	toggleMaximizeSession(sessionId: string): void {
		if (!this._gridWidget) {
			return;
		}
		const slot = this._views.get(sessionId);
		if (!slot) {
			return;
		}
		if (this._gridWidget.isViewMaximized(slot.view)) {
			this._gridWidget.exitMaximizedView();
		} else if (this._gridOrder.filter(k => k !== PLACEHOLDER_KEY).length >= 2) {
			this._gridWidget.maximizeView(slot.view);
			slot.view.focus();
		}
	}

	/**
	 * Returns the {@link SessionView} currently hosting the given session id, or
	 * the placeholder (new-session) view when `sessionId` is `undefined`. Returns
	 * `undefined` if no matching slot exists in the grid.
	 */
	getSessionView(sessionId: string | undefined): SessionView | undefined {
		const key = sessionId ?? PLACEHOLDER_KEY;
		return this._views.get(key)?.view;
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

	private _createSlot(key: string): IGridSlot {
		const disposables = new DisposableStore();
		const view = disposables.add(this.instantiationService.createInstance(SessionView));
		// Promote a visible session to the active session when its view receives
		// focus. The placeholder slot has no session to activate.
		if (key !== PLACEHOLDER_KEY) {
			disposables.add(addDisposableListener(view.element, EventType.FOCUS_IN, () => {
				this._onDidFocusSession.fire(key);
			}, true));
		}
		return { view, disposables };
	}

	private get _gridSeparatorBorder(): Color {
		return this.theme.getColor(agentsPanelBorder) || this.theme.getColor(contrastBorder) || Color.transparent;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		// Store background and border as CSS variables for the card styling on .part
		container.style.setProperty('--part-background', this.getColor(agentsPanelBackground) || '');
		container.style.setProperty('--part-border-color', this.getColor(agentsPanelBorder) || 'transparent');
		container.style.setProperty('--part-foreground', this.getColor(agentsPanelForeground) || '');
		container.style.backgroundColor = this.getColor(agentsPanelBackground) || '';

		this._gridWidget?.style({ separatorBorder: this._gridSeparatorBorder });
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		// Compute content dimensions accounting for visual margins and border.
		// MARGIN_BOTTOM applies only when the panel is visible (paired with the panel's
		// 5px top margin to center the sash). When the panel is hidden the card fills its
		// cell; the workbench grid's 10px bottom gutter provides the visible gap.
		const borderTotal = SessionsPart.BORDER_WIDTH * 2;
		const marginLeft = this.layoutService.isVisible(Parts.SIDEBAR_PART) ? 0 : SessionsPart.MARGIN_LEFT;
		const marginBottom = this.layoutService.isVisible(Parts.PANEL_PART) ? SessionsPart.MARGIN_BOTTOM : 0;
		const marginRight = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) ? SessionsPart.MARGIN_RIGHT : 0;

		// Size the content area with the reduced dimensions.
		const { contentSize } = this.layoutContents(
			width - marginLeft - marginRight - borderTotal,
			height - SessionsPart.MARGIN_TOP - marginBottom - borderTotal
		);

		// Layout the internal grid widget within the content area.
		this._gridWidget?.layout(contentSize.width, contentSize.height, top, left);

		// Store the full grid-allocated dimensions so that Part.relayout() works correctly.
		super.layout(width, height, top, left);
	}

	override dispose(): void {
		for (const slot of this._views.values()) {
			slot.disposables.dispose();
		}
		this._views.clear();
		this._gridOrder = [];
		super.dispose();
	}

	toJSON(): object {
		return {
			type: Parts.SESSIONS_PART
		};
	}
}
