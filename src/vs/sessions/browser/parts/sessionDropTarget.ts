/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionDropTarget.css';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow } from '../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { assertReturnsAllDefined, assertReturnsDefined } from '../../../base/common/types.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { LocalSelectionTransfer } from '../../../platform/dnd/browser/dnd.js';
import { activeContrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../platform/theme/common/themeService.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../workbench/common/theme.js';
import { DraggedSessionIdentifier } from '../dnd.js';
import { ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';

/** Side of a target view where a dragged session can be dropped. */
type DropSide = 'left' | 'right';

/**
 * Resolves an HTML element under the part's content area to the session view
 * it belongs to (if any). Returns the session id and the view's root element.
 */
export interface ISessionDropTargetDelegate {
	findTargetView(child: HTMLElement): { readonly sessionId: string; readonly element: HTMLElement } | undefined;
}

class SessionDropOverlay extends Themable {

	private static readonly OVERLAY_ID = 'monaco-workbench-session-drop-overlay';

	private _container: HTMLElement | undefined;
	private _overlay: HTMLElement | undefined;

	private _currentSide: DropSide | undefined;

	private _disposed = false;
	get disposed(): boolean { return this._disposed; }

	private readonly _cleanupOverlayScheduler: RunOnceScheduler;

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	constructor(
		readonly targetSessionId: string,
		private readonly _targetElement: HTMLElement,
		@IThemeService themeService: IThemeService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super(themeService);

		this._cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));

		this._create();
	}

	private _create(): void {
		const container = this._container = $('div', { id: SessionDropOverlay.OVERLAY_ID });

		this._targetElement.appendChild(container);
		this._targetElement.classList.add('dragged-over');
		this._register(toDisposable(() => {
			container.remove();
			this._targetElement.classList.remove('dragged-over');
		}));

		this._overlay = $('.session-drop-overlay-indicator');
		container.appendChild(this._overlay);

		this._registerListeners(container);
		this.updateStyles();
	}

	override updateStyles(): void {
		const overlay = assertReturnsDefined(this._overlay);

		overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || '';

		const activeContrastBorderColor = this.getColor(activeContrastBorder);
		overlay.style.outlineColor = activeContrastBorderColor || '';
		overlay.style.outlineOffset = activeContrastBorderColor ? '-2px' : '';
		overlay.style.outlineStyle = activeContrastBorderColor ? 'dashed' : '';
		overlay.style.outlineWidth = activeContrastBorderColor ? '2px' : '';
	}

	private _registerListeners(container: HTMLElement): void {
		this._register(new DragAndDropObserver(container, {
			onDragOver: e => {
				if (!this._sessionTransfer.hasData(DraggedSessionIdentifier.prototype)) {
					this._hideOverlay();
					return;
				}

				this._positionOverlay(e.offsetX);

				if (this._cleanupOverlayScheduler.isScheduled()) {
					this._cleanupOverlayScheduler.cancel();
				}
			},

			onDragLeave: () => this.dispose(),
			onDragEnd: () => this.dispose(),

			onDrop: e => {
				EventHelper.stop(e, true);

				const side = this._currentSide;
				this.dispose();

				if (side) {
					this._handleDrop(side);
				}
			}
		}));

		this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
			// Mirror the editor overlay's mouse-over safety net: if the overlay
			// is somehow not cleaned up by drag events, the next mouse-over
			// schedules disposal to free the underlying view.
			if (!this._cleanupOverlayScheduler.isScheduled()) {
				this._cleanupOverlayScheduler.schedule();
			}
		}));
	}

	private _handleDrop(side: DropSide): void {
		const data = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype);
		this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);

		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		const dragged = data[0];
		if (dragged.sessionId === this.targetSessionId) {
			return; // dropping a session next to itself is a no-op
		}

		const session = this._sessionsManagementService.getSession(dragged.resource);
		if (!session) {
			return;
		}

		this._sessionsManagementService.insertAt(session, this.targetSessionId, side);
	}

	private _positionOverlay(mousePosX: number): void {
		const width = this._targetElement.clientWidth;
		const side: DropSide = mousePosX < width / 2 ? 'left' : 'right';

		if (side === 'left') {
			this._doPositionOverlay({ left: '0', width: '50%' });
		} else {
			this._doPositionOverlay({ left: '50%', width: '50%' });
		}

		const overlay = assertReturnsDefined(this._overlay);
		overlay.style.opacity = '1';

		// Enable transition after a timeout to prevent initial animation.
		setTimeout(() => overlay.classList.add('overlay-move-transition'), 0);

		this._currentSide = side;
	}

	private _doPositionOverlay(options: { left: string; width: string }): void {
		const [container, overlay] = assertReturnsAllDefined(this._container, this._overlay);
		container.style.height = '100%';
		overlay.style.top = '0';
		overlay.style.height = '100%';
		overlay.style.left = options.left;
		overlay.style.width = options.width;
	}

	private _hideOverlay(): void {
		const overlay = assertReturnsDefined(this._overlay);

		this._doPositionOverlay({ left: '0', width: '100%' });
		overlay.style.opacity = '0';
		overlay.classList.remove('overlay-move-transition');

		this._currentSide = undefined;
	}

	contains(element: HTMLElement): boolean {
		return element === this._container || element === this._overlay;
	}

	override dispose(): void {
		super.dispose();

		this._disposed = true;
	}
}

/**
 * Drop target for the sessions grid. Listens for drag events over the part's
 * content area, displays a half-pane overlay on whichever session view is
 * being hovered, and calls into {@link ISessionsManagementService} to insert
 * or move the dragged session next to the target.
 *
 * Currently supports only left/right insertion; up/down and "into" drops are
 * not supported.
 */
export class SessionDropTarget extends Themable {

	private _overlay?: SessionDropOverlay;

	private _counter = 0;

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	constructor(
		private readonly _container: HTMLElement,
		private readonly _delegate: ISessionDropTargetDelegate,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(themeService);

		this._registerListeners();
	}

	private get overlay(): SessionDropOverlay | undefined {
		if (this._overlay && !this._overlay.disposed) {
			return this._overlay;
		}
		return undefined;
	}

	private _registerListeners(): void {
		this._register(addDisposableListener(this._container, EventType.DRAG_ENTER, e => this._onDragEnter(e)));
		this._register(addDisposableListener(this._container, EventType.DRAG_LEAVE, () => this._onDragLeave()));
		for (const target of [this._container, getWindow(this._container)]) {
			this._register(addDisposableListener(target, EventType.DRAG_END, () => this._onDragEnd()));
		}
	}

	private _onDragEnter(event: DragEvent): void {
		this._counter++;

		// Only handle drags that carry a session payload.
		if (!this._sessionTransfer.hasData(DraggedSessionIdentifier.prototype)) {
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'none';
			}
			return;
		}

		this._updateContainer(true);

		const target = event.target as HTMLElement;
		if (!target) {
			return;
		}

		// If the mouse jumped out of the current overlay, dispose it.
		if (this.overlay && !this.overlay.contains(target)) {
			this._disposeOverlay();
		}

		if (this.overlay) {
			return;
		}

		const targetView = this._delegate.findTargetView(target);
		if (!targetView) {
			return;
		}

		this._overlay = this._instantiationService.createInstance(
			SessionDropOverlay,
			targetView.sessionId,
			targetView.element,
		);
	}

	private _onDragLeave(): void {
		this._counter--;

		if (this._counter === 0) {
			this._updateContainer(false);
		}
	}

	private _onDragEnd(): void {
		this._counter = 0;

		this._updateContainer(false);
		this._disposeOverlay();
	}

	private _updateContainer(isDraggedOver: boolean): void {
		this._container.classList.toggle('dragged-over', isDraggedOver);
	}

	override dispose(): void {
		super.dispose();
		this._disposeOverlay();
	}

	private _disposeOverlay(): void {
		if (this._overlay) {
			this._overlay.dispose();
			this._overlay = undefined;
		}
	}
}
