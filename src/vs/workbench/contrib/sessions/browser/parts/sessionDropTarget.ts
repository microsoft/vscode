/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionDropTarget.css';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, isHTMLElement } from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { assertReturnsAllDefined, assertReturnsDefined } from '../../../../../base/common/types.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { activeContrastBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../common/theme.js';
import { DraggedSessionIdentifier, getSessionChatDragData, isSessionChatDrag } from '../dnd.js';
import { InputDropTargetHints, isInputDropTarget, isPassThroughToInputDrag, PASS_THROUGH_MODIFIER_LABEL, registerPassThroughDropTarget } from '../../../../browser/dnd.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionsService, SessionGridDirection } from '../sessionsService.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';

/** Where a dragged session drops on a target view: beside it on a side, or in its middle, `'center'`, in place of what it shows. */
type DropSide = SessionGridDirection | 'center';

/** Fraction of a view's width and height, from each of its edges, where a drop opens beside the view rather than in it. */
const EDGE_THRESHOLD = 0.25;

/** The edge of a view of `width` by `height` nearest to `x`, `y`, and its distance relative to the view's size. */
function getNearestEdge(x: number, y: number, width: number, height: number): { readonly direction: SessionGridDirection; readonly distance: number } {
	const horizontal = x / Math.max(1, width);
	const vertical = y / Math.max(1, height);
	const distance = Math.min(horizontal, 1 - horizontal, vertical, 1 - vertical);
	const direction = distance === horizontal ? 'left' : distance === 1 - horizontal ? 'right' : distance === vertical ? 'up' : 'down';
	return { direction, distance };
}

export function getSessionDropDirection(x: number, y: number, width: number, height: number): SessionGridDirection {
	return getNearestEdge(x, y, width, height).direction;
}

/**
 * Where a drop at `x`, `y` in a view of `width` by `height` opens: in the view, `'center'`, in its middle; else beside it, on
 * the side of the nearest edge within {@link EDGE_THRESHOLD} of it.
 */
export function getSessionDropZone(x: number, y: number, width: number, height: number): DropSide {
	const edge = getNearestEdge(x, y, width, height);
	return edge.distance > EDGE_THRESHOLD ? 'center' : edge.direction;
}

/**
 * Resolves an HTML element under the part's content area to the session view
 * it belongs to (if any). Returns the session id and the view's root element.
 */
export interface ISessionDropTargetDelegate {
	findTargetView(child: HTMLElement): { readonly sessionId: string | undefined; readonly gridSlotId?: string; readonly chatResource?: URI; readonly element: HTMLElement } | undefined;
}

class SessionDropOverlay extends Themable {

	private static readonly OVERLAY_ID = 'monaco-workbench-session-drop-overlay';

	private _container: HTMLElement | undefined;
	private _overlay: HTMLElement | undefined;
	private _inputHints: InputDropTargetHints | undefined;

	private _currentSide: DropSide | undefined;

	private _disposed = false;
	get disposed(): boolean { return this._disposed; }

	private readonly _cleanupOverlayScheduler: RunOnceScheduler;

	private readonly _sessionTransfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	constructor(
		readonly targetSessionId: string | undefined,
		private readonly _targetElement: HTMLElement,
		private readonly _targetGridSlotId: string,
		private readonly _targetIsChat: boolean,
		event: DragEvent,
		@IThemeService themeService: IThemeService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super(themeService);

		this._cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));

		this._create(event);
	}

	private _create(event: DragEvent): void {
		const container = this._container = $('div', { id: SessionDropOverlay.OVERLAY_ID });

		this._targetElement.appendChild(container);
		this._targetElement.classList.add('dragged-over');
		this._register(toDisposable(() => {
			container.remove();
			this._targetElement.classList.remove('dragged-over');
		}));

		this._overlay = $('.session-drop-overlay-indicator');
		container.appendChild(this._overlay);

		this._inputHints = this._register(new InputDropTargetHints(this._targetElement, container, PASS_THROUGH_MODIFIER_LABEL));
		this._inputHints.update(event);

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
				// An input that takes the drag takes it once the drag moves over it, and so does the chat around it while the
				// key that lets drags through is held: the overlay, which covers them until then, goes away.
				if ((isHTMLElement(e.target) && isInputDropTarget(e.target, e, this._targetElement)) || isPassThroughToInputDrag(e, this._targetElement)) {
					this.dispose();
					return;
				}

				if (!this._sessionTransfer.hasData(DraggedSessionIdentifier.prototype) && !isSessionChatDrag(e)) {
					this._hideOverlay();
					return;
				}

				this._inputHints?.update(e);
				this._positionOverlay(e);

				if (this._cleanupOverlayScheduler.isScheduled()) {
					this._cleanupOverlayScheduler.cancel();
				}
			},

			onDragLeave: () => this.dispose(),
			onDragEnd: () => this.dispose(),

			onDrop: e => {
				EventHelper.stop(e, true);

				this._positionOverlay(e);
				const side = this._currentSide;
				this.dispose();

				if (side) {
					this._handleDrop(side, e);
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

	private _handleDrop(side: DropSide, event: DragEvent): void {
		if (side === 'center') {
			this._openInView();
			return;
		}
		const chat = getSessionChatDragData(event);
		if (chat) {
			void this._sessionsService.moveChatToGrid(chat.sessionId, URI.parse(chat.resource), this._targetGridSlotId, side).catch(onUnexpectedError);
			return;
		}
		const data = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype);
		this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);

		if (!Array.isArray(data) || data.length === 0) {
			return;
		}

		if (data.length === 1 && !data[0].resource) {
			this._sessionsService.insertAt(undefined, this.targetSessionId, side, true, this._targetGridSlotId);
			return;
		}

		const draft = data.length === 1 ? this._findDraft(data[0].sessionId) : undefined;
		if (draft) {
			this._sessionsService.insertAt(draft, this.targetSessionId, side, true, this._targetGridSlotId);
			return;
		}

		// Resolve all dragged sessions (preserving drag order), skipping the
		// target itself so dropping a session next to itself is a no-op.
		const sessions: ISession[] = [];
		for (const dragged of data) {
			if (!dragged.resource || dragged.sessionId === this.targetSessionId && !this._targetIsChat) {
				continue;
			}
			const session = this._sessionsManagementService.getSession(dragged.resource);
			if (session) {
				sessions.push(session);
			}
		}

		if (sessions.length === 0) {
			return;
		}

		void this._sessionsService.openSessionsAt(sessions, this.targetSessionId, side, { referenceSlotId: this._targetGridSlotId, forceMainChat: true }).catch(onUnexpectedError);
	}

	/**
	 * Whether a drop in the middle of the target view opens the drag in the view, in place of what it shows: one created
	 * session, dropped on the slot of a session or of the new session. Chats, several sessions, drafts and the new session
	 * only open beside a view, as does anything dropped on a chat's own pane.
	 */
	private _opensInView(event: DragEvent): boolean {
		if (this._targetIsChat || isSessionChatDrag(event)) {
			return false;
		}
		const data = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype);
		return data?.length === 1 && !!data[0].resource && !this._findDraft(data[0].sessionId);
	}

	/** The dragged session opens in the target view, in place of what it shows, as its main chat (see {@link _opensInView}). */
	private _openInView(): void {
		const dragged = this._sessionTransfer.getData(DraggedSessionIdentifier.prototype)?.[0];
		this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);
		const session = dragged?.resource && this._sessionsManagementService.getSession(dragged.resource);
		if (session) {
			void this._sessionsService.openSessionInSlot(session, this.targetSessionId, { forceMainChat: true }).catch(onUnexpectedError);
		}
	}

	/** The draft a slot of the grid shows as `sessionId`: provider drafts can be visible before they appear in the session list. */
	private _findDraft(sessionId: string | undefined): ISession | undefined {
		const session = this._sessionsService.slotPanes.get().map(pane => pane.session.get()).find(session => session?.sessionId === sessionId);
		return session && !isSessionCreated(session) ? session : undefined;
	}

	private _positionOverlay(event: DragEvent): void {
		const rect = this._targetElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const side = this._opensInView(event) ? getSessionDropZone(x, y, rect.width, rect.height) : getSessionDropDirection(x, y, rect.width, rect.height);

		if (side === 'center') {
			this._doPositionOverlay({ left: '0', width: '100%' });
		} else if (side === 'left') {
			this._doPositionOverlay({ left: '0', width: '50%' });
		} else if (side === 'right') {
			this._doPositionOverlay({ left: '50%', width: '50%' });
		} else {
			this._doPositionOverlay({ left: '0', width: '100%', top: side === 'up' ? '0' : '50%', height: '50%' });
		}

		const overlay = assertReturnsDefined(this._overlay);
		overlay.style.opacity = '1';

		// Enable transition after a timeout to prevent initial animation.
		setTimeout(() => overlay.classList.add('overlay-move-transition'), 0);

		this._currentSide = side;
	}

	private _doPositionOverlay(options: { left: string; width: string; top?: string; height?: string }): void {
		const [container, overlay] = assertReturnsAllDefined(this._container, this._overlay);
		container.style.height = '100%';
		overlay.style.top = options.top ?? '0';
		overlay.style.height = options.height ?? '100%';
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
 * content area, displays an overlay on whichever session view is being
 * hovered, and calls into {@link ISessionsService} to open the dragged session
 * in the target, or to insert or move it next to the target.
 *
 * In the middle of a view, one dragged session opens in the view, in place of
 * what it shows, as an editor dropped in the middle of an editor group opens in
 * that group; near an edge, or for drags that only open beside a view, the
 * nearest normalized edge selects a split.
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
		// While the key is held, the drags let through reach the chats under the overlays, which attach them, as in a chat editor
		this._register(registerPassThroughDropTarget(this._container, e => isPassThroughToInputDrag(e, this._container)));

		this._register(addDisposableListener(this._container, EventType.DRAG_ENTER, e => this._onDragEnter(e)));
		this._register(addDisposableListener(this._container, EventType.DRAG_LEAVE, () => this._onDragLeave()));
		for (const target of [this._container, getWindow(this._container)]) {
			this._register(addDisposableListener(target, EventType.DRAG_END, () => this._onDragEnd()));
		}
	}

	private _onDragEnter(event: DragEvent): void {
		this._counter++;
		// An input under the drag that takes it, such as a chat input that attaches the dragged session's chat, takes it here,
		// and so does the chat around such an input while the key that lets drags through is held.
		if ((isHTMLElement(event.target) && isInputDropTarget(event.target, event)) || isPassThroughToInputDrag(event, this._container)) {
			this._disposeOverlay();
			this._updateContainer(false);
			return;
		}

		// Only handle drags that carry a session payload.
		if (!this._sessionTransfer.hasData(DraggedSessionIdentifier.prototype) && !isSessionChatDrag(event)) {
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'none';
			}
			return;
		}

		const target = event.target as HTMLElement;
		if (!target) {
			return;
		}
		const targetView = this._delegate.findTargetView(target);
		if (targetView && targetView.sessionId !== undefined && !targetView.chatResource && isSessionChatDrag(event, targetView.sessionId)) {
			return;
		}
		if (targetView && !targetView.chatResource && this._sessionTransfer.getData(DraggedSessionIdentifier.prototype)?.every(dragged => dragged.sessionId === targetView.sessionId)) {
			return;
		}

		this._updateContainer(true);

		// If the mouse jumped out of the current overlay, dispose it.
		if (this.overlay && !this.overlay.contains(target)) {
			this._disposeOverlay();
		}

		if (this.overlay) {
			return;
		}

		if (!targetView) {
			return;
		}

		this._overlay = this._instantiationService.createInstance(
			SessionDropOverlay,
			targetView.sessionId,
			targetView.element,
			assertReturnsDefined(targetView.gridSlotId ?? targetView.sessionId),
			!!targetView.chatResource,
			event,
		);
	}

	private _onDragLeave(): void {
		this._counter--;

		if (this._counter === 0) {
			this._updateContainer(false);
			this._disposeOverlay();
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
