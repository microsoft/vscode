/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {GlobalMouseMoveMonitor} from 'vs/base/browser/globalMouseMoveMonitor';
import {IMouseEvent, StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IDomNodePosition, MouseTargetFactory} from 'vs/editor/browser/controller/mouseTarget';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';

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

class EventGateKeeper<T> {

	public handler: (value:T)=>void;

	private _destination: (value:T)=>void;
	private _condition: ()=>boolean;

	private _retryTimer: number;
	private _retryValue: T;

	constructor(destination:(value:T)=>void, condition:()=>boolean) {
		this._destination = destination;
		this._condition = condition;
		this._retryTimer = -1;
		this.handler = (value:T) => this._handle(value);
	}

	public dispose(): void {
		if (this._retryTimer !== -1) {
			clearTimeout(this._retryTimer);
			this._retryTimer = -1;
			this._retryValue = null;
		}
	}

	private _handle(value:T): void {
		if (this._condition()) {

			if (this._retryTimer !== -1) {
				clearTimeout(this._retryTimer);
				this._retryTimer = -1;
				this._retryValue = null;
			}

			this._destination(value);

		} else {
			this._retryValue = value;
			if (this._retryTimer === -1) {
				this._retryTimer = setTimeout(() => {
					this._retryTimer = -1;
					let tmp = this._retryValue;
					this._retryValue = null;
					this._handle(tmp);
				}, 10);
			}
		}
	}
}

export class MouseHandler extends ViewEventHandler implements IDisposable {

	static CLEAR_MOUSE_DOWN_COUNT_TIME = 400; // ms
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

		this._mouseDownOperation = new MouseDownOperation(this.context, this.viewController, this.viewHelper, (e, testEventTarget) => this._createMouseTarget(e, testEventTarget));

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

	protected _createMouseTarget(e:IMouseEvent, testEventTarget:boolean): editorBrowser.IMouseTarget {
		let editorContent = dom.getDomNodePosition(this.viewHelper.viewDomNode);
		return this.mouseTargetFactory.createMouseTarget(this._layoutInfo, editorContent, e, testEventTarget);
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

class MouseDownOperation {

	private _context:editorBrowser.IViewContext;
	private _viewController:editorBrowser.IViewController;
	private _viewHelper:editorBrowser.IPointerHandlerHelper;
	private _createMouseTarget:(e:IMouseEvent, testEventTarget:boolean)=>editorBrowser.IMouseTarget;

	private _mouseMoveMonitor:GlobalMouseMoveMonitor<IMouseEvent>;
	private _mouseDownThenMoveEventHandler: EventGateKeeper<IMouseEvent>;

	private _currentSelection: editorCommon.IEditorSelection;

	private _onScrollTimeout: number;
	private _isActive: boolean;

	private _startTargetType:editorCommon.MouseTargetType;
	private _lastMouseEvent: IMouseEvent;
	private _lastMouseDownPosition: editorCommon.IEditorPosition;
	private _lastMouseDownPositionEqualCount: number;
	private _lastMouseDownCount: number;
	private _lastSetMouseDownCountTime: number;

	constructor(
		context:editorBrowser.IViewContext,
		viewController:editorBrowser.IViewController,
		viewHelper:editorBrowser.IPointerHandlerHelper,
		createMouseTarget:(e:IMouseEvent, testEventTarget:boolean)=>editorBrowser.IMouseTarget
	) {
		this._context = context;
		this._viewController = viewController;
		this._viewHelper = viewHelper;
		this._createMouseTarget = createMouseTarget;

		this._currentSelection = Selection.createSelection(1, 1, 1, 1);

		this._onScrollTimeout = -1;
		this._isActive = false;

		this._startTargetType = editorCommon.MouseTargetType.UNKNOWN;
		this._lastMouseEvent = null;
		this._lastMouseDownPosition = null;
		this._lastMouseDownPositionEqualCount = 0;
		this._lastMouseDownCount = 0;
		this._lastSetMouseDownCountTime = 0;

		this._mouseMoveMonitor = new GlobalMouseMoveMonitor<IMouseEvent>();
		this._mouseDownThenMoveEventHandler = new EventGateKeeper<IMouseEvent>((e) => this._onMouseDownThenMove(e), () => !this._viewHelper.isDirty());
	}

	public dispose(): void {
		this._mouseMoveMonitor.dispose();
		this._mouseDownThenMoveEventHandler.dispose();
		this._stop();
	}

	public isActive(): boolean {
		return this._isActive;
	}

	private _onMouseDownThenMove(e:IMouseEvent): void {
		this._updateMouse(this._startTargetType, e, true);
	}

	public start(targetType:editorCommon.MouseTargetType, e:IMouseEvent): void {
		this._updateMouse(targetType, e, e.shiftKey, e.detail);

		this._startTargetType = targetType;
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
		if (this._onScrollTimeout !== -1) {
			window.clearTimeout(this._onScrollTimeout);
			this._onScrollTimeout = -1;
		}
	}

	public onScrollChanged(): void {
		if (!this._isActive) {
			return;
		}
		if (this._onScrollTimeout === -1) {
			this._onScrollTimeout = window.setTimeout(() => {
				this._onScrollTimeout = -1;
				this._updateMouse(this._startTargetType, null, true);
			}, 10);
		}
	}

	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): void {
		this._currentSelection = e.selection;
	}

	private _getPositionOutsideEditor(editorContent: IDomNodePosition, e: IMouseEvent): editorCommon.IPosition {
		let possibleLineNumber: number;

		if (e.posy < editorContent.top) {
			possibleLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(Math.max(this._viewHelper.getScrollTop() - (editorContent.top - e.posy), 0));
			return {
				lineNumber: possibleLineNumber,
				column: 1
			};
		}

		if (e.posy > editorContent.top + editorContent.height) {
			possibleLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(this._viewHelper.getScrollTop() + (e.posy - editorContent.top));
			return {
				lineNumber: possibleLineNumber,
				column: this._context.model.getLineMaxColumn(possibleLineNumber)
			};
		}

		possibleLineNumber = this._viewHelper.getLineNumberAtVerticalOffset(this._viewHelper.getScrollTop() + (e.posy - editorContent.top));

		if (e.posx < editorContent.left) {
			return {
				lineNumber: possibleLineNumber,
				column: 1
			};
		}

		if (e.posx > editorContent.left + editorContent.width) {
			return {
				lineNumber: possibleLineNumber,
				column: this._context.model.getLineMaxColumn(possibleLineNumber)
			};
		}

		return null;
	}

	private _updateMouse(startTargetType:editorCommon.MouseTargetType, e:IMouseEvent, inSelectionMode:boolean, setMouseDownCount:number = 0): void {
		e = e || this._lastMouseEvent;
		this._lastMouseEvent = e;

		let editorContent = dom.getDomNodePosition(this._viewHelper.viewDomNode);
		let positionOutsideEditor = this._getPositionOutsideEditor(editorContent, e);
		let lineNumber: number, column: number;

		if (positionOutsideEditor) {
			lineNumber = positionOutsideEditor.lineNumber;
			column = positionOutsideEditor.column;
		} else {
			let t = this._createMouseTarget(e, true);
			let hintedPosition = t.position;
			if (!hintedPosition) {
//				console.info('Ignoring updateMouse');
				return;
			}

			if (t.type === editorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === editorCommon.MouseTargetType.GUTTER_VIEW_ZONE) {
				// Force position on view zones to go above or below depending on where selection started from
				if (this._lastMouseDownCount > 0) {
					let selectionStart = new Position(this._currentSelection.selectionStartLineNumber, this._currentSelection.selectionStartColumn);
					let viewZoneData = <editorBrowser.IViewZoneData>t.detail;
					let positionBefore = viewZoneData.positionBefore;
					let positionAfter = viewZoneData.positionAfter;

					if (positionBefore && positionAfter) {
						if (positionBefore.isBefore(selectionStart)) {
							hintedPosition = positionBefore;
						} else {
							hintedPosition = positionAfter;
						}
					}
				}
			}

			lineNumber = hintedPosition.lineNumber;
			column = hintedPosition.column;
		}

		if (setMouseDownCount) {

			// a. Invalidate multiple clicking if too much time has passed (will be hit by IE because the detail field of mouse events contains garbage in IE10)
			let currentTime = (new Date()).getTime();
			if (currentTime - this._lastSetMouseDownCountTime > MouseHandler.CLEAR_MOUSE_DOWN_COUNT_TIME) {
				setMouseDownCount = 1;
			}
			this._lastSetMouseDownCountTime = currentTime;

			// b. Ensure that we don't jump from single click to triple click in one go (will be hit by IE because the detail field of mouse events contains garbage in IE10)
			if (setMouseDownCount > this._lastMouseDownCount + 1) {
				setMouseDownCount = this._lastMouseDownCount + 1;
			}

			// c. Invalidate multiple clicking if the logical position is different
			let newMouseDownPosition = new Position(lineNumber, column);
			if (this._lastMouseDownPosition && this._lastMouseDownPosition.equals(newMouseDownPosition)) {
				this._lastMouseDownPositionEqualCount++;
			} else {
				this._lastMouseDownPositionEqualCount = 1;
			}
			this._lastMouseDownPosition = newMouseDownPosition;

			// Finally set the lastMouseDownCount
			this._lastMouseDownCount = Math.min(setMouseDownCount, this._lastMouseDownPositionEqualCount);

			// Overwrite the detail of the MouseEvent, as it will be sent out in an event and contributions might rely on it.
			e.detail = this._lastMouseDownCount;
		}

		if (startTargetType === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS) {
			// If the dragging started on the gutter, then have operations work on the entire line
			if (e.altKey) {
				if (inSelectionMode) {
					this._viewController.lastCursorLineSelect('mouse', lineNumber, column);
				} else {
					this._viewController.createCursor('mouse', lineNumber, column, true);
				}
			} else {
				if (inSelectionMode) {
					this._viewController.lineSelectDrag('mouse', lineNumber, column);
				} else {
					this._viewController.lineSelect('mouse', lineNumber, column);
				}
			}
		} else if (this._lastMouseDownCount >= 4) {
			this._viewController.selectAll('mouse');
		} else if (this._lastMouseDownCount === 3) {
			if (e.altKey) {
				if (inSelectionMode) {
					this._viewController.lastCursorLineSelectDrag('mouse', lineNumber, column);
				} else {
					this._viewController.lastCursorLineSelect('mouse', lineNumber, column);
				}
			} else {
				if (inSelectionMode) {
					this._viewController.lineSelectDrag('mouse', lineNumber, column);
				} else {
					this._viewController.lineSelect('mouse', lineNumber, column);
				}
			}
		} else if (this._lastMouseDownCount === 2) {
			let preference = 'none';

			let visibleRangeForPosition = this._viewHelper.visibleRangeForPosition2(lineNumber, column);
			if (visibleRangeForPosition) {
				let columnPosX = editorContent.left + visibleRangeForPosition.left;
				if (e.posx > columnPosX) {
					preference = 'right';
				} else if (e.posx < columnPosX) {
					preference = 'left';
				}
			}
			if (e.altKey) {
				this._viewController.lastCursorWordSelect('mouse', lineNumber, column, preference);
			} else {
				if (inSelectionMode) {
					this._viewController.wordSelectDrag('mouse', lineNumber, column, preference);
				} else {
					this._viewController.wordSelect('mouse', lineNumber, column, preference);
				}
			}
		} else {
			if (e.altKey) {
				if (!e.ctrlKey && !e.metaKey) {
					// Do multi-cursor operations only when purely alt is pressed
					if (inSelectionMode) {
						this._viewController.lastCursorMoveToSelect('mouse', lineNumber, column);
					} else {
						this._viewController.createCursor('mouse', lineNumber, column, false);
					}
				}
			} else {
				if (inSelectionMode) {
					this._viewController.moveToSelect('mouse', lineNumber, column);
				} else {
					this._viewController.moveTo('mouse', lineNumber, column);
				}
			}
		}
	}
}
