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
		var r = new StandardMouseEvent(currentEvent);
		var targetIsWidget = false;
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

	private hideTextAreaTimeout: number;

	private mouseMoveMonitor:GlobalMouseMoveMonitor<IMouseEvent>;
	private monitoringStartTargetType: editorCommon.MouseTargetType;
	private currentSelection: editorCommon.IEditorSelection;
	private lastMouseEvent: IMouseEvent;
	private lastMouseDownPosition: editorCommon.IEditorPosition;
	private lastMouseDownPositionEqualCount: number;
	private lastMouseDownCount: number;
	private lastSetMouseDownCountTime: number;
	private onScrollTimeout: number;

	private layoutWidth:number;
	private layoutHeight:number;

	private lastMouseLeaveTime:number;

	private _mouseMoveEventHandler: EventGateKeeper<IMouseEvent>;
	private _mouseDownThenMoveEventHandler: EventGateKeeper<IMouseEvent>;

	constructor(context:editorBrowser.IViewContext, viewController:editorBrowser.IViewController, viewHelper:editorBrowser.IPointerHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.viewHelper = viewHelper;
		this.mouseTargetFactory = new MouseTargetFactory(this.context, viewHelper);
		this.listenersToRemove = [];

		this.hideTextAreaTimeout = -1;

		this.toDispose = [];
		this.mouseMoveMonitor = new GlobalMouseMoveMonitor<IMouseEvent>();
		this.toDispose.push(this.mouseMoveMonitor);

		this.lastMouseEvent = null;
		this.lastMouseDownPosition = null;
		this.currentSelection = Selection.createSelection(1, 1, 1, 1);
		this.lastMouseDownPositionEqualCount = 0;
		this.lastMouseDownCount = 0;
		this.lastSetMouseDownCountTime = 0;
		this.onScrollTimeout = -1;

		this.layoutWidth = 0;
		this.layoutHeight = 0;

		this.lastMouseLeaveTime = -1;

		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.viewDomNode, 'contextmenu',
			(e: MouseEvent) => this._onContextMenu(e)));

		this._mouseMoveEventHandler = new EventGateKeeper<IMouseEvent>((e) => this._onMouseMove(e), () => !this.viewHelper.isDirty());
		this.toDispose.push(this._mouseMoveEventHandler);
		this.listenersToRemove.push(dom.addDisposableThrottledListener(this.viewHelper.viewDomNode, 'mousemove',
			this._mouseMoveEventHandler.handler,
			createMouseMoveEventMerger(this.mouseTargetFactory), MouseHandler.MOUSE_MOVE_MINIMUM_TIME));

		this._mouseDownThenMoveEventHandler = new EventGateKeeper<IMouseEvent>((e) => this._onMouseDownThenMove(e), () => !this.viewHelper.isDirty());
		this.toDispose.push(this._mouseDownThenMoveEventHandler);

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
		this._unhook();
		if (this.hideTextAreaTimeout !== -1) {
			window.clearTimeout(this.hideTextAreaTimeout);
			this.hideTextAreaTimeout = -1;
		}
	}

	// --- begin event handlers
	_layoutInfo:editorCommon.IEditorLayoutInfo;
	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		this._layoutInfo = layoutInfo;
		return false;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		if (this.mouseMoveMonitor.isMonitoring()) {
			this._hookedOnScroll(e);
		}
		return false;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.currentSelection = e.selection;
		return false;
	}
	// --- end event handlers

	protected _createMouseTarget(e:IMouseEvent, testEventTarget:boolean): editorBrowser.IMouseTarget {
		var editorContent = dom.getDomNodePosition(this.viewHelper.viewDomNode);
		return this.mouseTargetFactory.createMouseTarget(this._layoutInfo, editorContent, e, testEventTarget);
	}

	private _onContextMenu(rawEvent: MouseEvent): void {
		var e = new StandardMouseEvent(rawEvent);
		var t = this._createMouseTarget(e, true);
		var mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitContextMenu(mouseEvent);
	}

	private _onMouseMove(e: IMouseEvent): void {
		if (this.mouseMoveMonitor.isMonitoring()) {
			// In selection/drag operation
			return;
		}
		var actualMouseMoveTime = e.timestamp;
		if (actualMouseMoveTime < this.lastMouseLeaveTime) {
			// Due to throttling, this event occured before the mouse left the editor, therefore ignore it.
			return;
		}

		var t = this._createMouseTarget(e, true);
		var mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseMove(mouseEvent);
	}

	private _onMouseLeave(rawEvent: MouseEvent): void {
		this.lastMouseLeaveTime = (new Date()).getTime();
		var mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: new StandardMouseEvent(rawEvent),
			target: null
		};
		this.viewController.emitMouseLeave(mouseEvent);
	}

	public _onMouseUp(rawEvent: MouseEvent): void {
		var e = new StandardMouseEvent(rawEvent);
		var t = this._createMouseTarget(e, true);

		var mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseUp(mouseEvent);
	}

	public _onMouseDown(rawEvent: MouseEvent): void {
		var e = new StandardMouseEvent(rawEvent);
		var t = this._createMouseTarget(e, true);

		var targetIsContent = (t.type === editorCommon.MouseTargetType.CONTENT_TEXT || t.type === editorCommon.MouseTargetType.CONTENT_EMPTY);
		var targetIsGutter = (t.type === editorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS || t.type === editorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS);
		var targetIsLineNumbers = (t.type === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS);
		var selectOnLineNumbers = this.context.configuration.editor.selectOnLineNumbers;
		var targetIsViewZone = (t.type === editorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === editorCommon.MouseTargetType.GUTTER_VIEW_ZONE);

		var shouldHandle = e.leftButton;
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
			this._updateMouse(t.type, e, e.shiftKey, e.detail);
			this._hook(t.type);
		} else if (targetIsGutter) {
			// Do not steal focus
			e.preventDefault();
		} else if (targetIsViewZone) {
			var viewZoneData = <editorBrowser.IViewZoneData>t.detail;
			if (this.viewHelper.shouldSuppressMouseDownOnViewZone(viewZoneData.viewZoneId)) {
				e.preventDefault();
			}
		}

		var mouseEvent: editorBrowser.IEditorMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseDown(mouseEvent);
	}

	private _hookedOnScroll(rawEvent:editorCommon.IScrollEvent): void {
		if (this.onScrollTimeout === -1) {
			this.onScrollTimeout = window.setTimeout(() => {
				this.onScrollTimeout = -1;
				this._updateMouse(this.monitoringStartTargetType, null, true);
			}, 10);
		}
	}

	private _hook(startTargetType:editorCommon.MouseTargetType): void {
		if (this.mouseMoveMonitor.isMonitoring()) {
			// Already monitoring
			return;
		}

		this.monitoringStartTargetType = startTargetType;

		this.mouseMoveMonitor.startMonitoring(
			createMouseMoveEventMerger(null),
			this._mouseDownThenMoveEventHandler.handler,
			() => {
				this._unhook();
			}
		);
	}

	private _onMouseDownThenMove(e:IMouseEvent): void {
		this._updateMouse(this.monitoringStartTargetType, e, true);
	}

	private _unhook(): void {
		if (this.onScrollTimeout !== -1) {
			window.clearTimeout(this.onScrollTimeout);
			this.onScrollTimeout = -1;
		}
	}

	private _getPositionOutsideEditor(editorContent: IDomNodePosition, e: IMouseEvent): editorCommon.IPosition {
		var possibleLineNumber: number;

		if (e.posy < editorContent.top) {
			possibleLineNumber = this.viewHelper.getLineNumberAtVerticalOffset(Math.max(this.viewHelper.getScrollTop() - (editorContent.top - e.posy), 0));
			return {
				lineNumber: possibleLineNumber,
				column: 1
			};
		}

		if (e.posy > editorContent.top + editorContent.height) {
			possibleLineNumber = this.viewHelper.getLineNumberAtVerticalOffset(this.viewHelper.getScrollTop() + (e.posy - editorContent.top));
			return {
				lineNumber: possibleLineNumber,
				column: this.context.model.getLineMaxColumn(possibleLineNumber)
			};
		}

		possibleLineNumber = this.viewHelper.getLineNumberAtVerticalOffset(this.viewHelper.getScrollTop() + (e.posy - editorContent.top));

		if (e.posx < editorContent.left) {
			return {
				lineNumber: possibleLineNumber,
				column: 1
			};
		}

		if (e.posx > editorContent.left + editorContent.width) {
			return {
				lineNumber: possibleLineNumber,
				column: this.context.model.getLineMaxColumn(possibleLineNumber)
			};
		}

		return null;
	}

	private _updateMouse(startTargetType:editorCommon.MouseTargetType, e:IMouseEvent, inSelectionMode:boolean, setMouseDownCount:number = 0): void {
		e = e || this.lastMouseEvent;
		this.lastMouseEvent = e;

		var editorContent = dom.getDomNodePosition(this.viewHelper.viewDomNode);
		var positionOutsideEditor = this._getPositionOutsideEditor(editorContent, e);
		var lineNumber: number, column: number;

		if (positionOutsideEditor) {
			lineNumber = positionOutsideEditor.lineNumber;
			column = positionOutsideEditor.column;
		} else {
			var t = this._createMouseTarget(e, true);
			var hintedPosition = t.position;
			if (!hintedPosition) {
//				console.info('Ignoring updateMouse');
				return;
			}

			if (t.type === editorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === editorCommon.MouseTargetType.GUTTER_VIEW_ZONE) {
				// Force position on view zones to go above or below depending on where selection started from
				if (this.lastMouseDownCount > 0) {
					var selectionStart = new Position(this.currentSelection.selectionStartLineNumber, this.currentSelection.selectionStartColumn);
					var viewZoneData = <editorBrowser.IViewZoneData>t.detail;
					var positionBefore = viewZoneData.positionBefore;
					var positionAfter = viewZoneData.positionAfter;

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
			var currentTime = (new Date()).getTime();
			if (currentTime - this.lastSetMouseDownCountTime > MouseHandler.CLEAR_MOUSE_DOWN_COUNT_TIME) {
				setMouseDownCount = 1;
			}
			this.lastSetMouseDownCountTime = currentTime;

			// b. Ensure that we don't jump from single click to triple click in one go (will be hit by IE because the detail field of mouse events contains garbage in IE10)
			if (setMouseDownCount > this.lastMouseDownCount + 1) {
				setMouseDownCount = this.lastMouseDownCount + 1;
			}

			// c. Invalidate multiple clicking if the logical position is different
			var newMouseDownPosition = new Position(lineNumber, column);
			if (this.lastMouseDownPosition && this.lastMouseDownPosition.equals(newMouseDownPosition)) {
				this.lastMouseDownPositionEqualCount++;
			} else {
				this.lastMouseDownPositionEqualCount = 1;
			}
			this.lastMouseDownPosition = newMouseDownPosition;

			// Finally set the lastMouseDownCount
			this.lastMouseDownCount = Math.min(setMouseDownCount, this.lastMouseDownPositionEqualCount);

			// Overwrite the detail of the MouseEvent, as it will be sent out in an event and contributions might rely on it.
			e.detail = this.lastMouseDownCount;
		}

		if (startTargetType === editorCommon.MouseTargetType.GUTTER_LINE_NUMBERS) {
			// If the dragging started on the gutter, then have operations work on the entire line
			if (e.altKey) {
				if (inSelectionMode) {
					this.viewController.lastCursorLineSelect('mouse', lineNumber, column);
				} else {
					this.viewController.createCursor('mouse', lineNumber, column, true);
				}
			} else {
				if (inSelectionMode) {
					this.viewController.lineSelectDrag('mouse', lineNumber, column);
				} else {
					this.viewController.lineSelect('mouse', lineNumber, column);
				}
			}
		} else if (this.lastMouseDownCount >= 4) {
			this.viewController.selectAll('mouse');
		} else if (this.lastMouseDownCount === 3) {
			if (e.altKey) {
				if (inSelectionMode) {
					this.viewController.lastCursorLineSelectDrag('mouse', lineNumber, column);
				} else {
					this.viewController.lastCursorLineSelect('mouse', lineNumber, column);
				}
			} else {
				if (inSelectionMode) {
					this.viewController.lineSelectDrag('mouse', lineNumber, column);
				} else {
					this.viewController.lineSelect('mouse', lineNumber, column);
				}
			}
		} else if (this.lastMouseDownCount === 2) {
			var preference = 'none';

			var visibleRangeForPosition = this.viewHelper.visibleRangeForPosition2(lineNumber, column);
			if (visibleRangeForPosition) {
				var columnPosX = editorContent.left + visibleRangeForPosition.left;
				if (e.posx > columnPosX) {
					preference = 'right';
				} else if (e.posx < columnPosX) {
					preference = 'left';
				}
			}
			if (e.altKey) {
				this.viewController.lastCursorWordSelect('mouse', lineNumber, column, preference);
			} else {
				if (inSelectionMode) {
					this.viewController.wordSelectDrag('mouse', lineNumber, column, preference);
				} else {
					this.viewController.wordSelect('mouse', lineNumber, column, preference);
				}
			}
		} else {
			if (e.altKey) {
				if (!e.ctrlKey && !e.metaKey) {
					// Do multi-cursor operations only when purely alt is pressed
					if (inSelectionMode) {
						this.viewController.lastCursorMoveToSelect('mouse', lineNumber, column);
					} else {
						this.viewController.createCursor('mouse', lineNumber, column, false);
					}
				}
			} else {
				if (inSelectionMode) {
					this.viewController.moveToSelect('mouse', lineNumber, column);
				} else {
					this.viewController.moveTo('mouse', lineNumber, column);
				}
			}
		}
	}
}
