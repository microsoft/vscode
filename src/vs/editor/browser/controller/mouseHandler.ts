/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardWheelEvent, IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { HitTestContext, MouseTarget, MouseTargetFactory, PointerHandlerLastRenderData } from 'vs/editor/browser/controller/mouseTarget';
import { IMouseTarget, IMouseTargetOutsideEditor, IMouseTargetViewZoneData, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ClientCoordinates, EditorMouseEvent, EditorMouseEventFactory, GlobalEditorPointerMoveMonitor, createEditorPagePosition, createCoordinatesRelativeToEditor, PageCoordinates } from 'vs/editor/browser/editorDom';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { ViewEventHandler } from 'vs/editor/common/viewEventHandler';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { NavigationCommandRevealType } from 'vs/editor/browser/coreCommands';
import { MouseWheelClassifier } from 'vs/base/browser/ui/scrollbar/scrollableElement';

export interface IPointerHandlerHelper {
	viewDomNode: HTMLElement;
	linesContentDomNode: HTMLElement;
	viewLinesDomNode: HTMLElement;

	focusTextArea(): void;
	dispatchTextAreaEvent(event: CustomEvent): void;

	/**
	 * Get the last rendered information for cursors & textarea.
	 */
	getLastRenderData(): PointerHandlerLastRenderData;

	/**
	 * Render right now
	 */
	renderNow(): void;

	shouldSuppressMouseDownOnViewZone(viewZoneId: string): boolean;
	shouldSuppressMouseDownOnWidget(widgetId: string): boolean;

	/**
	 * Decode a position from a rendered dom node
	 */
	getPositionFromDOMInfo(spanNode: HTMLElement, offset: number): Position | null;

	visibleRangeForPosition(lineNumber: number, column: number): HorizontalPosition | null;
	getLineWidth(lineNumber: number): number;
}

export class MouseHandler extends ViewEventHandler {

	protected _context: ViewContext;
	protected viewController: ViewController;
	protected viewHelper: IPointerHandlerHelper;
	protected mouseTargetFactory: MouseTargetFactory;
	protected readonly _mouseDownOperation: MouseDownOperation;
	private lastMouseLeaveTime: number;
	private _height: number;
	private _mouseLeaveMonitor: IDisposable | null = null;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: IPointerHandlerHelper) {
		super();

		this._context = context;
		this.viewController = viewController;
		this.viewHelper = viewHelper;
		this.mouseTargetFactory = new MouseTargetFactory(this._context, viewHelper);

		this._mouseDownOperation = this._register(new MouseDownOperation(
			this._context,
			this.viewController,
			this.viewHelper,
			this.mouseTargetFactory,
			(e, testEventTarget) => this._createMouseTarget(e, testEventTarget),
			(e) => this._getMouseColumn(e)
		));

		this.lastMouseLeaveTime = -1;
		this._height = this._context.configuration.options.get(EditorOption.layoutInfo).height;

		const mouseEvents = new EditorMouseEventFactory(this.viewHelper.viewDomNode);

		this._register(mouseEvents.onContextMenu(this.viewHelper.viewDomNode, (e) => this._onContextMenu(e, true)));

		this._register(mouseEvents.onMouseMove(this.viewHelper.viewDomNode, (e) => {
			this._onMouseMove(e);

			// See https://github.com/microsoft/vscode/issues/138789
			// When moving the mouse really quickly, the browser sometimes forgets to
			// send us a `mouseleave` or `mouseout` event. We therefore install here
			// a global `mousemove` listener to manually recover if the mouse goes outside
			// the editor. As soon as the mouse leaves outside of the editor, we
			// remove this listener

			if (!this._mouseLeaveMonitor) {
				this._mouseLeaveMonitor = dom.addDisposableListener(this.viewHelper.viewDomNode.ownerDocument, 'mousemove', (e) => {
					if (!this.viewHelper.viewDomNode.contains(e.target as Node | null)) {
						// went outside the editor!
						this._onMouseLeave(new EditorMouseEvent(e, false, this.viewHelper.viewDomNode));
					}
				});
			}
		}));

		this._register(mouseEvents.onMouseUp(this.viewHelper.viewDomNode, (e) => this._onMouseUp(e)));

		this._register(mouseEvents.onMouseLeave(this.viewHelper.viewDomNode, (e) => this._onMouseLeave(e)));

		// `pointerdown` events can't be used to determine if there's a double click, or triple click
		// because their `e.detail` is always 0.
		// We will therefore save the pointer id for the mouse and then reuse it in the `mousedown` event
		// for `element.setPointerCapture`.
		let capturePointerId: number = 0;
		this._register(mouseEvents.onPointerDown(this.viewHelper.viewDomNode, (e, pointerId) => {
			capturePointerId = pointerId;
		}));
		// The `pointerup` listener registered by `GlobalEditorPointerMoveMonitor` does not get invoked 100% of the times.
		// I speculate that this is because the `pointerup` listener is only registered during the `mousedown` event, and perhaps
		// the `pointerup` event is already queued for dispatching, which makes it that the new listener doesn't get fired.
		// See https://github.com/microsoft/vscode/issues/146486 for repro steps.
		// To compensate for that, we simply register here a `pointerup` listener and just communicate it.
		this._register(dom.addDisposableListener(this.viewHelper.viewDomNode, dom.EventType.POINTER_UP, (e: PointerEvent) => {
			this._mouseDownOperation.onPointerUp();
		}));
		this._register(mouseEvents.onMouseDown(this.viewHelper.viewDomNode, (e) => this._onMouseDown(e, capturePointerId)));
		this._setupMouseWheelZoomListener();

		this._context.addEventHandler(this);
	}

	private _setupMouseWheelZoomListener(): void {

		const classifier = MouseWheelClassifier.INSTANCE;

		let prevMouseWheelTime = 0;
		let gestureStartZoomLevel = EditorZoom.getZoomLevel();
		let gestureHasZoomModifiers = false;
		let gestureAccumulatedDelta = 0;

		const onMouseWheel = (browserEvent: IMouseWheelEvent) => {
			this.viewController.emitMouseWheel(browserEvent);

			if (!this._context.configuration.options.get(EditorOption.mouseWheelZoom)) {
				return;
			}

			const e = new StandardWheelEvent(browserEvent);
			classifier.acceptStandardWheelEvent(e);

			if (classifier.isPhysicalMouseWheel()) {
				if (hasMouseWheelZoomModifiers(browserEvent)) {
					const zoomLevel: number = EditorZoom.getZoomLevel();
					const delta = e.deltaY > 0 ? 1 : -1;
					EditorZoom.setZoomLevel(zoomLevel + delta);
					e.preventDefault();
					e.stopPropagation();
				}
			} else {
				// we consider mousewheel events that occur within 50ms of each other to be part of the same gesture
				// we don't want to consider mouse wheel events where ctrl/cmd is pressed during the inertia phase
				// we also want to accumulate deltaY values from the same gesture and use that to set the zoom level
				if (Date.now() - prevMouseWheelTime > 50) {
					// reset if more than 50ms have passed
					gestureStartZoomLevel = EditorZoom.getZoomLevel();
					gestureHasZoomModifiers = hasMouseWheelZoomModifiers(browserEvent);
					gestureAccumulatedDelta = 0;
				}

				prevMouseWheelTime = Date.now();
				gestureAccumulatedDelta += e.deltaY;

				if (gestureHasZoomModifiers) {
					EditorZoom.setZoomLevel(gestureStartZoomLevel + gestureAccumulatedDelta / 5);
					e.preventDefault();
					e.stopPropagation();
				}
			}
		};
		this._register(dom.addDisposableListener(this.viewHelper.viewDomNode, dom.EventType.MOUSE_WHEEL, onMouseWheel, { capture: true, passive: false }));

		function hasMouseWheelZoomModifiers(browserEvent: IMouseWheelEvent): boolean {
			return (
				platform.isMacintosh
					// on macOS we support cmd + two fingers scroll (`metaKey` set)
					// and also the two fingers pinch gesture (`ctrKey` set)
					? ((browserEvent.metaKey || browserEvent.ctrlKey) && !browserEvent.shiftKey && !browserEvent.altKey)
					: (browserEvent.ctrlKey && !browserEvent.metaKey && !browserEvent.shiftKey && !browserEvent.altKey)
			);
		}
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		if (this._mouseLeaveMonitor) {
			this._mouseLeaveMonitor.dispose();
			this._mouseLeaveMonitor = null;
		}
		super.dispose();
	}

	// --- begin event handlers
	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.hasChanged(EditorOption.layoutInfo)) {
			// layout change
			const height = this._context.configuration.options.get(EditorOption.layoutInfo).height;
			if (this._height !== height) {
				this._height = height;
				this._mouseDownOperation.onHeightChanged();
			}
		}
		return false;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._mouseDownOperation.onCursorStateChanged(e);
		return false;
	}
	public override onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		return false;
	}
	// --- end event handlers

	public getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget | null {
		const clientPos = new ClientCoordinates(clientX, clientY);
		const pos = clientPos.toPageCoordinates();
		const editorPos = createEditorPagePosition(this.viewHelper.viewDomNode);

		if (pos.y < editorPos.y || pos.y > editorPos.y + editorPos.height || pos.x < editorPos.x || pos.x > editorPos.x + editorPos.width) {
			return null;
		}

		const relativePos = createCoordinatesRelativeToEditor(this.viewHelper.viewDomNode, editorPos, pos);
		return this.mouseTargetFactory.createMouseTarget(this.viewHelper.getLastRenderData(), editorPos, pos, relativePos, null);
	}

	protected _createMouseTarget(e: EditorMouseEvent, testEventTarget: boolean): IMouseTarget {
		let target = e.target;
		if (!this.viewHelper.viewDomNode.contains(target)) {
			const shadowRoot = dom.getShadowRoot(this.viewHelper.viewDomNode);
			if (shadowRoot) {
				target = (<any>shadowRoot).elementsFromPoint(e.posx, e.posy).find(
					(el: Element) => this.viewHelper.viewDomNode.contains(el)
				);
			}
		}
		return this.mouseTargetFactory.createMouseTarget(this.viewHelper.getLastRenderData(), e.editorPos, e.pos, e.relativePos, testEventTarget ? target : null);
	}

	private _getMouseColumn(e: EditorMouseEvent): number {
		return this.mouseTargetFactory.getMouseColumn(e.relativePos);
	}

	protected _onContextMenu(e: EditorMouseEvent, testEventTarget: boolean): void {
		this.viewController.emitContextMenu({
			event: e,
			target: this._createMouseTarget(e, testEventTarget)
		});
	}

	protected _onMouseMove(e: EditorMouseEvent): void {
		const targetIsWidget = this.mouseTargetFactory.mouseTargetIsWidget(e);
		if (!targetIsWidget) {
			e.preventDefault();
		}

		if (this._mouseDownOperation.isActive()) {
			// In selection/drag operation
			return;
		}
		const actualMouseMoveTime = e.timestamp;
		if (actualMouseMoveTime < this.lastMouseLeaveTime) {
			// Due to throttling, this event occurred before the mouse left the editor, therefore ignore it.
			return;
		}

		this.viewController.emitMouseMove({
			event: e,
			target: this._createMouseTarget(e, true)
		});
	}

	protected _onMouseLeave(e: EditorMouseEvent): void {
		if (this._mouseLeaveMonitor) {
			this._mouseLeaveMonitor.dispose();
			this._mouseLeaveMonitor = null;
		}
		this.lastMouseLeaveTime = (new Date()).getTime();
		this.viewController.emitMouseLeave({
			event: e,
			target: null
		});
	}

	protected _onMouseUp(e: EditorMouseEvent): void {
		this.viewController.emitMouseUp({
			event: e,
			target: this._createMouseTarget(e, true)
		});
	}

	protected _onMouseDown(e: EditorMouseEvent, pointerId: number): void {
		const t = this._createMouseTarget(e, true);

		const targetIsContent = (t.type === MouseTargetType.CONTENT_TEXT || t.type === MouseTargetType.CONTENT_EMPTY);
		const targetIsGutter = (t.type === MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === MouseTargetType.GUTTER_LINE_NUMBERS || t.type === MouseTargetType.GUTTER_LINE_DECORATIONS);
		const targetIsLineNumbers = (t.type === MouseTargetType.GUTTER_LINE_NUMBERS);
		const selectOnLineNumbers = this._context.configuration.options.get(EditorOption.selectOnLineNumbers);
		const targetIsViewZone = (t.type === MouseTargetType.CONTENT_VIEW_ZONE || t.type === MouseTargetType.GUTTER_VIEW_ZONE);
		const targetIsWidget = (t.type === MouseTargetType.CONTENT_WIDGET);

		let shouldHandle = e.leftButton || e.middleButton;
		if (platform.isMacintosh && e.leftButton && e.ctrlKey) {
			shouldHandle = false;
		}

		const focus = () => {
			e.preventDefault();
			this.viewHelper.focusTextArea();
		};

		if (shouldHandle && (targetIsContent || (targetIsLineNumbers && selectOnLineNumbers))) {
			focus();
			this._mouseDownOperation.start(t.type, e, pointerId);

		} else if (targetIsGutter) {
			// Do not steal focus
			e.preventDefault();
		} else if (targetIsViewZone) {
			const viewZoneData = t.detail;
			if (shouldHandle && this.viewHelper.shouldSuppressMouseDownOnViewZone(viewZoneData.viewZoneId)) {
				focus();
				this._mouseDownOperation.start(t.type, e, pointerId);
				e.preventDefault();
			}
		} else if (targetIsWidget && this.viewHelper.shouldSuppressMouseDownOnWidget(<string>t.detail)) {
			focus();
			e.preventDefault();
		}

		this.viewController.emitMouseDown({
			event: e,
			target: t
		});
	}

	protected _onMouseWheel(e: IMouseWheelEvent): void {
		this.viewController.emitMouseWheel(e);
	}
}

class MouseDownOperation extends Disposable {

	private readonly _createMouseTarget: (e: EditorMouseEvent, testEventTarget: boolean) => IMouseTarget;
	private readonly _getMouseColumn: (e: EditorMouseEvent) => number;

	private readonly _mouseMoveMonitor: GlobalEditorPointerMoveMonitor;
	private readonly _topBottomDragScrolling: TopBottomDragScrolling;
	private readonly _mouseState: MouseDownState;

	private _currentSelection: Selection;
	private _isActive: boolean;
	private _lastMouseEvent: EditorMouseEvent | null;

	constructor(
		private readonly _context: ViewContext,
		private readonly _viewController: ViewController,
		private readonly _viewHelper: IPointerHandlerHelper,
		private readonly _mouseTargetFactory: MouseTargetFactory,
		createMouseTarget: (e: EditorMouseEvent, testEventTarget: boolean) => IMouseTarget,
		getMouseColumn: (e: EditorMouseEvent) => number
	) {
		super();
		this._createMouseTarget = createMouseTarget;
		this._getMouseColumn = getMouseColumn;

		this._mouseMoveMonitor = this._register(new GlobalEditorPointerMoveMonitor(this._viewHelper.viewDomNode));
		this._topBottomDragScrolling = this._register(new TopBottomDragScrolling(
			this._context,
			this._viewHelper,
			this._mouseTargetFactory,
			(position, inSelectionMode, revealType) => this._dispatchMouse(position, inSelectionMode, revealType)
		));
		this._mouseState = new MouseDownState();

		this._currentSelection = new Selection(1, 1, 1, 1);
		this._isActive = false;
		this._lastMouseEvent = null;
	}

	public override dispose(): void {
		super.dispose();
	}

	public isActive(): boolean {
		return this._isActive;
	}

	private _onMouseDownThenMove(e: EditorMouseEvent): void {
		this._lastMouseEvent = e;
		this._mouseState.setModifiers(e);

		const position = this._findMousePosition(e, false);
		if (!position) {
			// Ignoring because position is unknown
			return;
		}

		if (this._mouseState.isDragAndDrop) {
			this._viewController.emitMouseDrag({
				event: e,
				target: position
			});
		} else {
			if (position.type === MouseTargetType.OUTSIDE_EDITOR && (position.outsidePosition === 'above' || position.outsidePosition === 'below')) {
				this._topBottomDragScrolling.start(position, e);
			} else {
				this._topBottomDragScrolling.stop();
				this._dispatchMouse(position, true, NavigationCommandRevealType.Minimal);
			}
		}
	}

	public start(targetType: MouseTargetType, e: EditorMouseEvent, pointerId: number): void {
		this._lastMouseEvent = e;

		this._mouseState.setStartedOnLineNumbers(targetType === MouseTargetType.GUTTER_LINE_NUMBERS);
		this._mouseState.setStartButtons(e);
		this._mouseState.setModifiers(e);
		const position = this._findMousePosition(e, true);
		if (!position || !position.position) {
			// Ignoring because position is unknown
			return;
		}

		this._mouseState.trySetCount(e.detail, position.position);

		// Overwrite the detail of the MouseEvent, as it will be sent out in an event and contributions might rely on it.
		e.detail = this._mouseState.count;

		const options = this._context.configuration.options;

		if (!options.get(EditorOption.readOnly)
			&& options.get(EditorOption.dragAndDrop)
			&& !options.get(EditorOption.columnSelection)
			&& !this._mouseState.altKey // we don't support multiple mouse
			&& e.detail < 2 // only single click on a selection can work
			&& !this._isActive // the mouse is not down yet
			&& !this._currentSelection.isEmpty() // we don't drag single cursor
			&& (position.type === MouseTargetType.CONTENT_TEXT) // single click on text
			&& position.position && this._currentSelection.containsPosition(position.position) // single click on a selection
		) {
			this._mouseState.isDragAndDrop = true;
			this._isActive = true;

			this._mouseMoveMonitor.startMonitoring(
				this._viewHelper.viewLinesDomNode,
				pointerId,
				e.buttons,
				(e) => this._onMouseDownThenMove(e),
				(browserEvent?: MouseEvent | KeyboardEvent) => {
					const position = this._findMousePosition(this._lastMouseEvent!, false);

					if (browserEvent && browserEvent instanceof KeyboardEvent) {
						// cancel
						this._viewController.emitMouseDropCanceled();
					} else {
						this._viewController.emitMouseDrop({
							event: this._lastMouseEvent!,
							target: (position ? this._createMouseTarget(this._lastMouseEvent!, true) : null) // Ignoring because position is unknown, e.g., Content View Zone
						});
					}

					this._stop();
				}
			);

			return;
		}

		this._mouseState.isDragAndDrop = false;
		this._dispatchMouse(position, e.shiftKey, NavigationCommandRevealType.Minimal);

		if (!this._isActive) {
			this._isActive = true;
			this._mouseMoveMonitor.startMonitoring(
				this._viewHelper.viewLinesDomNode,
				pointerId,
				e.buttons,
				(e) => this._onMouseDownThenMove(e),
				() => this._stop()
			);
		}
	}

	private _stop(): void {
		this._isActive = false;
		this._topBottomDragScrolling.stop();
	}

	public onHeightChanged(): void {
		this._mouseMoveMonitor.stopMonitoring();
	}

	public onPointerUp(): void {
		this._mouseMoveMonitor.stopMonitoring();
	}

	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): void {
		this._currentSelection = e.selections[0];
	}

	private _getPositionOutsideEditor(e: EditorMouseEvent): IMouseTarget | null {
		const editorContent = e.editorPos;
		const model = this._context.viewModel;
		const viewLayout = this._context.viewLayout;

		const mouseColumn = this._getMouseColumn(e);

		if (e.posy < editorContent.y) {
			const outsideDistance = editorContent.y - e.posy;
			const verticalOffset = Math.max(viewLayout.getCurrentScrollTop() - outsideDistance, 0);
			const viewZoneData = HitTestContext.getZoneAtCoord(this._context, verticalOffset);
			if (viewZoneData) {
				const newPosition = this._helpPositionJumpOverViewZone(viewZoneData);
				if (newPosition) {
					return MouseTarget.createOutsideEditor(mouseColumn, newPosition, 'above', outsideDistance);
				}
			}

			const aboveLineNumber = viewLayout.getLineNumberAtVerticalOffset(verticalOffset);
			return MouseTarget.createOutsideEditor(mouseColumn, new Position(aboveLineNumber, 1), 'above', outsideDistance);
		}

		if (e.posy > editorContent.y + editorContent.height) {
			const outsideDistance = e.posy - editorContent.y - editorContent.height;
			const verticalOffset = viewLayout.getCurrentScrollTop() + e.relativePos.y;
			const viewZoneData = HitTestContext.getZoneAtCoord(this._context, verticalOffset);
			if (viewZoneData) {
				const newPosition = this._helpPositionJumpOverViewZone(viewZoneData);
				if (newPosition) {
					return MouseTarget.createOutsideEditor(mouseColumn, newPosition, 'below', outsideDistance);
				}
			}

			const belowLineNumber = viewLayout.getLineNumberAtVerticalOffset(verticalOffset);
			return MouseTarget.createOutsideEditor(mouseColumn, new Position(belowLineNumber, model.getLineMaxColumn(belowLineNumber)), 'below', outsideDistance);
		}

		const possibleLineNumber = viewLayout.getLineNumberAtVerticalOffset(viewLayout.getCurrentScrollTop() + e.relativePos.y);

		if (e.posx < editorContent.x) {
			const outsideDistance = editorContent.x - e.posx;
			return MouseTarget.createOutsideEditor(mouseColumn, new Position(possibleLineNumber, 1), 'left', outsideDistance);
		}

		if (e.posx > editorContent.x + editorContent.width) {
			const outsideDistance = e.posx - editorContent.x - editorContent.width;
			return MouseTarget.createOutsideEditor(mouseColumn, new Position(possibleLineNumber, model.getLineMaxColumn(possibleLineNumber)), 'right', outsideDistance);
		}

		return null;
	}

	private _findMousePosition(e: EditorMouseEvent, testEventTarget: boolean): IMouseTarget | null {
		const positionOutsideEditor = this._getPositionOutsideEditor(e);
		if (positionOutsideEditor) {
			return positionOutsideEditor;
		}

		const t = this._createMouseTarget(e, testEventTarget);
		const hintedPosition = t.position;
		if (!hintedPosition) {
			return null;
		}

		if (t.type === MouseTargetType.CONTENT_VIEW_ZONE || t.type === MouseTargetType.GUTTER_VIEW_ZONE) {
			const newPosition = this._helpPositionJumpOverViewZone(t.detail);
			if (newPosition) {
				return MouseTarget.createViewZone(t.type, t.element, t.mouseColumn, newPosition, t.detail);
			}
		}

		return t;
	}

	private _helpPositionJumpOverViewZone(viewZoneData: IMouseTargetViewZoneData): Position | null {
		// Force position on view zones to go above or below depending on where selection started from
		const selectionStart = new Position(this._currentSelection.selectionStartLineNumber, this._currentSelection.selectionStartColumn);
		const positionBefore = viewZoneData.positionBefore;
		const positionAfter = viewZoneData.positionAfter;

		if (positionBefore && positionAfter) {
			if (positionBefore.isBefore(selectionStart)) {
				return positionBefore;
			} else {
				return positionAfter;
			}
		}
		return null;
	}

	private _dispatchMouse(position: IMouseTarget, inSelectionMode: boolean, revealType: NavigationCommandRevealType): void {
		if (!position.position) {
			return;
		}
		this._viewController.dispatchMouse({
			position: position.position,
			mouseColumn: position.mouseColumn,
			startedOnLineNumbers: this._mouseState.startedOnLineNumbers,
			revealType,

			inSelectionMode: inSelectionMode,
			mouseDownCount: this._mouseState.count,
			altKey: this._mouseState.altKey,
			ctrlKey: this._mouseState.ctrlKey,
			metaKey: this._mouseState.metaKey,
			shiftKey: this._mouseState.shiftKey,

			leftButton: this._mouseState.leftButton,
			middleButton: this._mouseState.middleButton,

			onInjectedText: position.type === MouseTargetType.CONTENT_TEXT && position.detail.injectedText !== null
		});
	}
}

class TopBottomDragScrolling extends Disposable {

	private _operation: TopBottomDragScrollingOperation | null;

	constructor(
		private readonly _context: ViewContext,
		private readonly _viewHelper: IPointerHandlerHelper,
		private readonly _mouseTargetFactory: MouseTargetFactory,
		private readonly _dispatchMouse: (position: IMouseTarget, inSelectionMode: boolean, revealType: NavigationCommandRevealType) => void,
	) {
		super();
		this._operation = null;
	}

	public override dispose(): void {
		super.dispose();
		this.stop();
	}

	public start(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): void {
		if (this._operation) {
			this._operation.setPosition(position, mouseEvent);
		} else {
			this._operation = new TopBottomDragScrollingOperation(this._context, this._viewHelper, this._mouseTargetFactory, this._dispatchMouse, position, mouseEvent);
		}
	}

	public stop(): void {
		if (this._operation) {
			this._operation.dispose();
			this._operation = null;
		}
	}
}

class TopBottomDragScrollingOperation extends Disposable {

	private _position: IMouseTargetOutsideEditor;
	private _mouseEvent: EditorMouseEvent;
	private _lastTime: number;
	private _animationFrameDisposable: IDisposable;

	constructor(
		private readonly _context: ViewContext,
		private readonly _viewHelper: IPointerHandlerHelper,
		private readonly _mouseTargetFactory: MouseTargetFactory,
		private readonly _dispatchMouse: (position: IMouseTarget, inSelectionMode: boolean, revealType: NavigationCommandRevealType) => void,
		position: IMouseTargetOutsideEditor,
		mouseEvent: EditorMouseEvent
	) {
		super();
		this._position = position;
		this._mouseEvent = mouseEvent;
		this._lastTime = Date.now();
		this._animationFrameDisposable = dom.scheduleAtNextAnimationFrame(() => this._execute());
	}

	public override dispose(): void {
		this._animationFrameDisposable.dispose();
	}

	public setPosition(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): void {
		this._position = position;
		this._mouseEvent = mouseEvent;
	}

	/**
	 * update internal state and return elapsed ms since last time
	 */
	private _tick(): number {
		const now = Date.now();
		const elapsed = now - this._lastTime;
		this._lastTime = now;
		return elapsed;
	}

	/**
	 * get the number of lines per second to auto-scroll
	 */
	private _getScrollSpeed(): number {
		const lineHeight = this._context.configuration.options.get(EditorOption.lineHeight);
		const viewportInLines = this._context.configuration.options.get(EditorOption.layoutInfo).height / lineHeight;
		const outsideDistanceInLines = this._position.outsideDistance / lineHeight;

		if (outsideDistanceInLines <= 1.5) {
			return Math.max(30, viewportInLines * (1 + outsideDistanceInLines));
		}
		if (outsideDistanceInLines <= 3) {
			return Math.max(60, viewportInLines * (2 + outsideDistanceInLines));
		}
		return Math.max(200, viewportInLines * (7 + outsideDistanceInLines));
	}

	private _execute(): void {
		const lineHeight = this._context.configuration.options.get(EditorOption.lineHeight);
		const scrollSpeedInLines = this._getScrollSpeed();
		const elapsed = this._tick();
		const scrollInPixels = scrollSpeedInLines * (elapsed / 1000) * lineHeight;
		const scrollValue = (this._position.outsidePosition === 'above' ? -scrollInPixels : scrollInPixels);

		this._context.viewModel.viewLayout.deltaScrollNow(0, scrollValue);
		this._viewHelper.renderNow();

		const viewportData = this._context.viewLayout.getLinesViewportData();
		const edgeLineNumber = (this._position.outsidePosition === 'above' ? viewportData.startLineNumber : viewportData.endLineNumber);

		// First, try to find a position that matches the horizontal position of the mouse
		let mouseTarget: IMouseTarget;
		{
			const editorPos = createEditorPagePosition(this._viewHelper.viewDomNode);
			const horizontalScrollbarHeight = this._context.configuration.options.get(EditorOption.layoutInfo).horizontalScrollbarHeight;
			const pos = new PageCoordinates(this._mouseEvent.pos.x, editorPos.y + editorPos.height - horizontalScrollbarHeight - 0.1);
			const relativePos = createCoordinatesRelativeToEditor(this._viewHelper.viewDomNode, editorPos, pos);
			mouseTarget = this._mouseTargetFactory.createMouseTarget(this._viewHelper.getLastRenderData(), editorPos, pos, relativePos, null);
		}
		if (!mouseTarget.position || mouseTarget.position.lineNumber !== edgeLineNumber) {
			if (this._position.outsidePosition === 'above') {
				mouseTarget = MouseTarget.createOutsideEditor(this._position.mouseColumn, new Position(edgeLineNumber, 1), 'above', this._position.outsideDistance);
			} else {
				mouseTarget = MouseTarget.createOutsideEditor(this._position.mouseColumn, new Position(edgeLineNumber, this._context.viewModel.getLineMaxColumn(edgeLineNumber)), 'below', this._position.outsideDistance);
			}
		}

		this._dispatchMouse(mouseTarget, true, NavigationCommandRevealType.None);
		this._animationFrameDisposable = dom.scheduleAtNextAnimationFrame(() => this._execute());
	}
}

class MouseDownState {

	private static readonly CLEAR_MOUSE_DOWN_COUNT_TIME = 400; // ms

	private _altKey: boolean;
	public get altKey(): boolean { return this._altKey; }

	private _ctrlKey: boolean;
	public get ctrlKey(): boolean { return this._ctrlKey; }

	private _metaKey: boolean;
	public get metaKey(): boolean { return this._metaKey; }

	private _shiftKey: boolean;
	public get shiftKey(): boolean { return this._shiftKey; }

	private _leftButton: boolean;
	public get leftButton(): boolean { return this._leftButton; }

	private _middleButton: boolean;
	public get middleButton(): boolean { return this._middleButton; }

	private _startedOnLineNumbers: boolean;
	public get startedOnLineNumbers(): boolean { return this._startedOnLineNumbers; }

	private _lastMouseDownPosition: Position | null;
	private _lastMouseDownPositionEqualCount: number;
	private _lastMouseDownCount: number;
	private _lastSetMouseDownCountTime: number;
	public isDragAndDrop: boolean;

	constructor() {
		this._altKey = false;
		this._ctrlKey = false;
		this._metaKey = false;
		this._shiftKey = false;
		this._leftButton = false;
		this._middleButton = false;
		this._startedOnLineNumbers = false;
		this._lastMouseDownPosition = null;
		this._lastMouseDownPositionEqualCount = 0;
		this._lastMouseDownCount = 0;
		this._lastSetMouseDownCountTime = 0;
		this.isDragAndDrop = false;
	}

	public get count(): number {
		return this._lastMouseDownCount;
	}

	public setModifiers(source: EditorMouseEvent) {
		this._altKey = source.altKey;
		this._ctrlKey = source.ctrlKey;
		this._metaKey = source.metaKey;
		this._shiftKey = source.shiftKey;
	}

	public setStartButtons(source: EditorMouseEvent) {
		this._leftButton = source.leftButton;
		this._middleButton = source.middleButton;
	}

	public setStartedOnLineNumbers(startedOnLineNumbers: boolean): void {
		this._startedOnLineNumbers = startedOnLineNumbers;
	}

	public trySetCount(setMouseDownCount: number, newMouseDownPosition: Position): void {
		// a. Invalidate multiple clicking if too much time has passed (will be hit by IE because the detail field of mouse events contains garbage in IE10)
		const currentTime = (new Date()).getTime();
		if (currentTime - this._lastSetMouseDownCountTime > MouseDownState.CLEAR_MOUSE_DOWN_COUNT_TIME) {
			setMouseDownCount = 1;
		}
		this._lastSetMouseDownCountTime = currentTime;

		// b. Ensure that we don't jump from single click to triple click in one go (will be hit by IE because the detail field of mouse events contains garbage in IE10)
		if (setMouseDownCount > this._lastMouseDownCount + 1) {
			setMouseDownCount = this._lastMouseDownCount + 1;
		}

		// c. Invalidate multiple clicking if the logical position is different
		if (this._lastMouseDownPosition && this._lastMouseDownPosition.equals(newMouseDownPosition)) {
			this._lastMouseDownPositionEqualCount++;
		} else {
			this._lastMouseDownPositionEqualCount = 1;
		}
		this._lastMouseDownPosition = newMouseDownPosition;

		// Finally set the lastMouseDownCount
		this._lastMouseDownCount = Math.min(setMouseDownCount, this._lastMouseDownPositionEqualCount);
	}

}
