/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, disposeAll, Disposable} from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {GlobalMouseMoveMonitor} from 'vs/base/browser/globalMouseMoveMonitor';
import {IMouseEvent, StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {MouseTargetFactory, ISimplifiedMouseEvent} from 'vs/editor/browser/controller/mouseTarget';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import {TimeoutTimer} from 'vs/base/common/async';

/**
 * Merges mouse events when mouse move events are throttled
 */
function createMouseMoveEventMerger(mouseTargetFactory:MouseTargetFactory) {
	return function(lastEvent:IMouseEvent, currentEvent:MouseEvent): IMouseEvent {
		let r = new StandardMouseEvent(currentEvent);
		let targetIsWidget = false;
		if (mouseTargetFactory) {
			targetIsWidget = mouseTargetFactory.mouseTargetIsWidget(r);
		}
		if (!targetIsWidget) {
			r.preventDefault();
		}
		return r;
	};
}

class EventGateKeeper<T> extends Disposable {

	public handler: (value:T)=>void;

	private _destination: (value:T)=>void;
	private _condition: ()=>boolean;

	private _retryTimer: TimeoutTimer;
	private _retryValue: T;

	constructor(destination:(value:T)=>void, condition:()=>boolean) {
		super();
		this._destination = destination;
		this._condition = condition;
		this._retryTimer = this._register(new TimeoutTimer());
		this.handler = (value:T) => this._handle(value);
	}

	public dispose(): void {
		this._retryValue = null;
		super.dispose();
	}

	private _handle(value:T): void {
		if (this._condition()) {
			this._retryTimer.cancel();
			this._retryValue = null;
			this._destination(value);
		} else {
			this._retryValue = value;
			this._retryTimer.setIfNotSet(() => {
				let tmp = this._retryValue;
				this._retryValue = null;
				this._handle(tmp);
			}, 10);
		}
	}
}

class MousePosition {
	public position: editorCommon.IEditorPosition;
	public mouseColumn: number;

	constructor(position:editorCommon.IEditorPosition, mouseColumn:number) {
		this.position = position;
		this.mouseColumn = mouseColumn;
	}
}

export class MouseHandler extends ViewEventHandler implements IDisposable {

	static MOUSE_MOVE_MINIMUM_TIME = 100; // ms

	public context:editorBrowser.IViewContext;
	public viewController:editorBrowser.IViewController;
	public viewHelper:editorBrowser.IPointerHandlerHelper;
	public mouseTargetFactory: MouseTargetFactory;
	public listenersToRemove:IDisposable[];
	private toDispose:IDisposable[];

	private _mouseDownOperation: MouseDownOperation;
	private lastMouseLeaveTime:number;

	private _mouseMoveEventHandler: EventGateKeeper<IMouseEvent>;

	constructor(context:editorBrowser.IViewContext, viewController:editorBrowser.IViewController, viewHelper:editorBrowser.IPointerHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.viewHelper = viewHelper;
		this.mouseTargetFactory = new MouseTargetFactory(this.context, viewHelper);
		this.listenersToRemove = [];

		this._mouseDownOperation = new MouseDownOperation(
			this.context,
			this.viewController,
			this.viewHelper,
			(e, testEventTarget) => this._createMouseTarget(e, testEventTarget),
			(e) => this._getMouseColumn(e)
		);

		this.toDispose = [];

		this.lastMouseLeaveTime = -1;

		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.viewDomNode, 'contextmenu',
			(e: MouseEvent) => this._onContextMenu(e, true)));

		this._mouseMoveEventHandler = new EventGateKeeper<IMouseEvent>((e) => this._onMouseMove(e), () => !this.viewHelper.isDirty());
		this.toDispose.push(this._mouseMoveEventHandler);
		this.listenersToRemove.push(dom.addDisposableThrottledListener(this.viewHelper.viewDomNode, 'mousemove',
			this._mouseMoveEventHandler.handler,
			createMouseMoveEventMerger(this.mouseTargetFactory), MouseHandler.MOUSE_MOVE_MINIMUM_TIME));

		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.viewDomNode, 'mouseup',
			(e: MouseEvent) => this._onMouseUp(e)));

		this.listenersToRemove.push(dom.addDisposableNonBubblingMouseOutListener(this.viewHelper.viewDomNode,
			(e:MouseEvent) => this._onMouseLeave(e)));

		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.viewDomNode, 'mousedown',
			(e: MouseEvent) => this._onMouseDown(e)));

		this.context.addEventHandler(this);
	}

	public dispose(): void {
		this.context.removeEventHandler(this);
		this.listenersToRemove = disposeAll(this.listenersToRemove);
		this.toDispose = disposeAll(this.toDispose);
		this._mouseDownOperation.dispose();
	}

	// --- begin event handlers
	_layoutInfo:editorCommon.IEditorLayoutInfo;
	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		this._layoutInfo = layoutInfo;
		return false;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		this._mouseDownOperation.onScrollChanged();
		return false;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		this._mouseDownOperation.onCursorSelectionChanged(e);
		return false;
	}
	// --- end event handlers

	protected _createMouseTarget(e:ISimplifiedMouseEvent, testEventTarget:boolean): editorBrowser.IMouseTarget {
		let editorContent = dom.getDomNodePosition(this.viewHelper.viewDomNode);
		return this.mouseTargetFactory.createMouseTarget(this._layoutInfo, editorContent, e, testEventTarget);
	}

	private _getMouseColumn(e:ISimplifiedMouseEvent): number {
		let editorContent = dom.getDomNodePosition(this.viewHelper.viewDomNode);
		return this.mouseTargetFactory.getMouseColumn(this._layoutInfo, editorContent, e);
	}

	protected _onContextMenu(rawEvent: MouseEvent, testEventTarget:boolean): void {
		let e = new StandardMouseEvent(rawEvent);
		let t = this._createMouseTarget(e, testEventTarget);
		let mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitContextMenu(mouseEvent);
	}

	private _onMouseMove(e: IMouseEvent): void {
		if (this._mouseDownOperation.isActive()) {
			// In selection/drag operation
			return;
		}
		let actualMouseMoveTime = e.timestamp;
		if (actualMouseMoveTime < this.lastMouseLeaveTime) {
			// Due to throttling, this event occured before the mouse left the editor, therefore ignore it.
			return;
		}

		let t = this._createMouseTarget(e, true);
		let mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseMove(mouseEvent);
	}

	private _onMouseLeave(rawEvent: MouseEvent): void {
		this.lastMouseLeaveTime = (new Date()).getTime();
		let mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: new StandardMouseEvent(rawEvent),
			target: null
		};
		this.viewController.emitMouseLeave(mouseEvent);
	}

	public _onMouseUp(rawEvent: MouseEvent): void {
		let e = new StandardMouseEvent(rawEvent);
		let t = this._createMouseTarget(e, true);

		let mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseUp(mouseEvent);
	}

	public _onMouseDown(rawEvent: MouseEvent): void {
		let e = new StandardMouseEvent(rawEvent);
		let t = this._createMouseTarget(e, true);

		let targetIsContent = (t.type === editorCommon.MouseTargetType.CONTENT_TEXT || t.type === editorCommon.MouseTargetType.CONTENT_EMPTY);
		let targetIsGutter = (t.type === editorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS || t.type === editorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS);
		let targetIsLineNumbers = (t.type === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS);
		let selectOnLineNumbers = this.context.configuration.editor.selectOnLineNumbers;
		let targetIsViewZone = (t.type === editorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === editorCommon.MouseTargetType.GUTTER_VIEW_ZONE);

		let shouldHandle = e.leftButton;
		if (platform.isMacintosh && e.ctrlKey) {
			shouldHandle = false;
		}

		if (shouldHandle && (targetIsContent || (targetIsLineNumbers && selectOnLineNumbers))) {
			if (browser.isIE11orEarlier) {
				// IE does not want to focus when coming in from the browser's address bar
				if ((<any>e.browserEvent).fromElement) {
					e.preventDefault();
					this.viewHelper.focusTextArea();
				} else {
					// TODO@Alex -> cancel this if focus is lost
					setTimeout(() => {
						this.viewHelper.focusTextArea();
					});
				}
			} else {
				e.preventDefault();
				this.viewHelper.focusTextArea();
			}

			this._mouseDownOperation.start(t.type, e);

		} else if (targetIsGutter) {
			// Do not steal focus
			e.preventDefault();
		} else if (targetIsViewZone) {
			let viewZoneData = <editorBrowser.IViewZoneData>t.detail;
			if (this.viewHelper.shouldSuppressMouseDownOnViewZone(viewZoneData.viewZoneId)) {
				e.preventDefault();
			}
		}

		let mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseDown(mouseEvent);
	}
}

class MouseDownOperation extends Disposable {

	private _context:editorBrowser.IViewContext;
	private _viewController:editorBrowser.IViewController;
	private _viewHelper:editorBrowser.IPointerHandlerHelper;
	private _createMouseTarget:(e:ISimplifiedMouseEvent, testEventTarget:boolean)=>editorBrowser.IMouseTarget;
	private _getMouseColumn:(e:ISimplifiedMouseEvent)=>number;

	private _mouseMoveMonitor:GlobalMouseMoveMonitor<IMouseEvent>;
	private _mouseDownThenMoveEventHandler: EventGateKeeper<IMouseEvent>;

	private _currentSelection: editorCommon.IEditorSelection;
	private _mouseState: MouseDownState;

	private _onScrollTimeout: TimeoutTimer;
	private _isActive: boolean;

	private _lastMouseEvent: IMouseEvent;

	constructor(
		context:editorBrowser.IViewContext,
		viewController:editorBrowser.IViewController,
		viewHelper:editorBrowser.IPointerHandlerHelper,
		createMouseTarget:(e:ISimplifiedMouseEvent, testEventTarget:boolean)=>editorBrowser.IMouseTarget,
		getMouseColumn:(e:ISimplifiedMouseEvent)=>number
	) {
		super();
		this._context = context;
		this._viewController = viewController;
		this._viewHelper = viewHelper;
		this._createMouseTarget = createMouseTarget;
		this._getMouseColumn = getMouseColumn;

		this._currentSelection = Selection.createSelection(1, 1, 1, 1);
		this._mouseState = new MouseDownState();

		this._onScrollTimeout = this._register(new TimeoutTimer());
		this._isActive = false;

		this._lastMouseEvent = null;

		this._mouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<IMouseEvent>());
		this._mouseDownThenMoveEventHandler = this._register(
			new EventGateKeeper<IMouseEvent>(
				(e) => this._onMouseDownThenMove(e),
				() => !this._viewHelper.isDirty()
			)
		);
	}

	public dispose(): void {
		super.dispose();
	}

	public isActive(): boolean {
		return this._isActive;
	}

	private _onMouseDownThenMove(e:IMouseEvent): void {
		this._lastMouseEvent = e;
		this._mouseState.setModifiers(e);

		let position = this._findMousePosition(e, true);
		if (!position) {
			// Ignoring because position is unknown
			return;
		}

		this._dispatchMouse(position, true);
	}

	public start(targetType:editorCommon.MouseTargetType, e:IMouseEvent): void {
		this._lastMouseEvent = e;

		this._mouseState.setStartedOnLineNumbers(targetType === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS);
		this._mouseState.setModifiers(e);

		let position = this._findMousePosition(e, true);
		if (!position) {
			// Ignoring because position is unknown
			return;
		}

		this._mouseState.trySetCount(e.detail, position.position);

		// Overwrite the detail of the MouseEvent, as it will be sent out in an event and contributions might rely on it.
		e.detail = this._mouseState.count;

		this._dispatchMouse(position, e.shiftKey);

		if (!this._isActive) {
			this._isActive = true;
			this._mouseMoveMonitor.startMonitoring(
				createMouseMoveEventMerger(null),
				this._mouseDownThenMoveEventHandler.handler,
				() => this._stop()
			);
		}
	}

	private _stop(): void {
		this._isActive = false;
		this._onScrollTimeout.cancel();
	}

	public onScrollChanged(): void {
		if (!this._isActive) {
			return;
		}
		this._onScrollTimeout.setIfNotSet(() => {
			let position = this._findMousePosition(this._lastMouseEvent, false);
			if (!position) {
				// Ignoring because position is unknown
				return;
			}
			this._dispatchMouse(position, true);
		}, 10);
	}

	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): void {
		this._currentSelection = e.selection;
	}

	// private _getMouseColumn(e: ISimplifiedMouseEvent)

	private _getPositionOutsideEditor(e: ISimplifiedMouseEvent): MousePosition {
		let editorContent = dom.getDomNodePosition(this._viewHelper.viewDomNode);
		let mouseColumn = this._getMouseColumn(e);

		if (e.posy < editorContent.top) {
			let aboveLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(Math.max(this._viewHelper.getScrollTop() - (editorContent.top - e.posy), 0));
			return new MousePosition(new Position(aboveLineNumber, 1), mouseColumn);
		}

		if (e.posy > editorContent.top + editorContent.height) {
			let belowLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(this._viewHelper.getScrollTop() + (e.posy - editorContent.top));
			return new MousePosition(new Position(belowLineNumber, this._context.model.getLineMaxColumn(belowLineNumber)), mouseColumn);
		}

		let possibleLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(this._viewHelper.getScrollTop() + (e.posy - editorContent.top));

		if (e.posx < editorContent.left) {
			return new MousePosition(new Position(possibleLineNumber, 1), mouseColumn);
		}

		if (e.posx > editorContent.left + editorContent.width) {
			return new MousePosition(new Position(possibleLineNumber, this._context.model.getLineMaxColumn(possibleLineNumber)), mouseColumn);
		}

		return null;
	}

	private _findMousePosition(e:ISimplifiedMouseEvent, testEventTarget:boolean): MousePosition {
		let positionOutsideEditor = this._getPositionOutsideEditor(e);
		if (positionOutsideEditor) {
			return positionOutsideEditor;
		}

		let t = this._createMouseTarget(e, testEventTarget);
		let hintedPosition = t.position;
		if (!hintedPosition) {
			return null;
		}

		if (t.type === editorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === editorCommon.MouseTargetType.GUTTER_VIEW_ZONE) {
			// Force position on view zones to go above or below depending on where selection started from
			let selectionStart = new Position(this._currentSelection.selectionStartLineNumber, this._currentSelection.selectionStartColumn);
			let viewZoneData = <editorBrowser.IViewZoneData>t.detail;
			let positionBefore = viewZoneData.positionBefore;
			let positionAfter = viewZoneData.positionAfter;

			if (positionBefore && positionAfter) {
				if (positionBefore.isBefore(selectionStart)) {
					return new MousePosition(positionBefore, t.mouseColumn);
				} else {
					return new MousePosition(positionAfter, t.mouseColumn);
				}
			}
		}

		return new MousePosition(hintedPosition, t.mouseColumn);
	}

	private _dispatchMouse(position: MousePosition, inSelectionMode:boolean): void {
		this._viewController.dispatchMouse({
			position: position.position,
			mouseColumn: position.mouseColumn,
			startedOnLineNumbers: this._mouseState.startedOnLineNumbers,

			inSelectionMode: inSelectionMode,
			mouseDownCount: this._mouseState.count,
			altKey: this._mouseState.altKey,
			ctrlKey: this._mouseState.ctrlKey,
			metaKey: this._mouseState.metaKey,
			shiftKey: this._mouseState.shiftKey,
		});
	}
}

class MouseDownState {

	private static CLEAR_MOUSE_DOWN_COUNT_TIME = 400; // ms

	private _altKey: boolean;
	public get altKey(): boolean { return this._altKey; }

	private _ctrlKey: boolean;
	public get ctrlKey(): boolean { return this._ctrlKey; }

	private _metaKey: boolean;
	public get metaKey(): boolean { return this._metaKey; }

	private _shiftKey: boolean;
	public get shiftKey(): boolean { return this._shiftKey; }

	private _startedOnLineNumbers: boolean;
	public get startedOnLineNumbers(): boolean { return this._startedOnLineNumbers; }

	private _lastMouseDownPosition: editorCommon.IEditorPosition;
	private _lastMouseDownPositionEqualCount: number;
	private _lastMouseDownCount: number;
	private _lastSetMouseDownCountTime: number;

	constructor() {
		this._altKey = false;
		this._ctrlKey = false;
		this._metaKey = false;
		this._shiftKey = false;
		this._startedOnLineNumbers = false;
		this._lastMouseDownPosition = null;
		this._lastMouseDownPositionEqualCount = 0;
		this._lastMouseDownCount = 0;
		this._lastSetMouseDownCountTime = 0;
	}

	public get count(): number {
		return this._lastMouseDownCount;
	}

	public setModifiers(source:IMouseEvent) {
		this._altKey = source.altKey;
		this._ctrlKey = source.ctrlKey;
		this._metaKey = source.metaKey;
		this._shiftKey = source.shiftKey;
	}

	public setStartedOnLineNumbers(startedOnLineNumbers:boolean): void {
		this._startedOnLineNumbers = startedOnLineNumbers;
	}

	public trySetCount(setMouseDownCount:number, newMouseDownPosition:editorCommon.IEditorPosition): void {
		// a. Invalidate multiple clicking if too much time has passed (will be hit by IE because the detail field of mouse events contains garbage in IE10)
		let currentTime = (new Date()).getTime();
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
