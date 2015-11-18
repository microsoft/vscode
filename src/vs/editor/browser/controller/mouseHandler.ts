/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Platform = require('vs/base/common/platform');
import Browser = require('vs/base/browser/browser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Mouse = require('vs/base/browser/mouseEvent');
import DomUtils = require('vs/base/browser/dom');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EventEmitter = require('vs/base/common/eventEmitter');
import MouseTarget = require('vs/editor/browser/controller/mouseTarget');
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import Lifecycle = require('vs/base/common/lifecycle');
import GlobalMouseMoveMonitor = require('vs/base/browser/globalMouseMoveMonitor');
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';

/**
 * Merges mouse events when mouse move events are throttled
 */
function createMouseMoveEventMerger(mouseTargetFactory:MouseTarget.MouseTargetFactory) {
	return function(lastEvent:Mouse.StandardMouseEvent, currentEvent:MouseEvent): Mouse.StandardMouseEvent {
		var r = new Mouse.StandardMouseEvent(currentEvent);
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

export class MouseHandler extends ViewEventHandler implements Lifecycle.IDisposable {

	static CLEAR_MOUSE_DOWN_COUNT_TIME = 400; // ms
	static MOUSE_MOVE_MINIMUM_TIME = 100; // ms

	public context:EditorBrowser.IViewContext;
	public viewController:EditorBrowser.IViewController;
	public viewHelper:EditorBrowser.IPointerHandlerHelper;
	public mouseTargetFactory: MouseTarget.MouseTargetFactory;
	public listenersToRemove:EventEmitter.ListenerUnbind[];
	private toDispose:Lifecycle.IDisposable[];

	private hideTextAreaTimeout: number;

	private mouseMoveMonitor:GlobalMouseMoveMonitor.GlobalMouseMoveMonitor<Mouse.StandardMouseEvent>;
	private monitoringStartTargetType: EditorCommon.MouseTargetType;
	private currentSelection: EditorCommon.IEditorSelection;
	private lastMouseEvent: Mouse.StandardMouseEvent;
	private lastMouseDownPosition: EditorCommon.IEditorPosition;
	private lastMouseDownPositionEqualCount: number;
	private lastMouseDownCount: number;
	private lastSetMouseDownCountTime: number;
	private onScrollTimeout: number;

	private layoutWidth:number;
	private layoutHeight:number;

	private lastMouseLeaveTime:number;

	private _mouseMoveEventHandler: EventGateKeeper<Mouse.StandardMouseEvent>;
	private _mouseDownThenMoveEventHandler: EventGateKeeper<Mouse.StandardMouseEvent>;

	constructor(context:EditorBrowser.IViewContext, viewController:EditorBrowser.IViewController, viewHelper:EditorBrowser.IPointerHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.viewHelper = viewHelper;
		this.mouseTargetFactory = new MouseTarget.MouseTargetFactory(this.context, viewHelper);
		this.listenersToRemove = [];

		this.hideTextAreaTimeout = -1;

		this.toDispose = [];
		this.mouseMoveMonitor = new GlobalMouseMoveMonitor.GlobalMouseMoveMonitor<Mouse.StandardMouseEvent>();
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

		this.listenersToRemove.push(DomUtils.addListener(this.viewHelper.viewDomNode, 'contextmenu',
			(e: MouseEvent) => this._onContextMenu(e)));

		this._mouseMoveEventHandler = new EventGateKeeper<Mouse.StandardMouseEvent>((e) => this._onMouseMove(e), () => !this.viewHelper.isDirty());
		this.toDispose.push(this._mouseMoveEventHandler);
		this.listenersToRemove.push(DomUtils.addThrottledListener(this.viewHelper.viewDomNode, 'mousemove',
			this._mouseMoveEventHandler.handler,
			createMouseMoveEventMerger(this.mouseTargetFactory), MouseHandler.MOUSE_MOVE_MINIMUM_TIME));

		this._mouseDownThenMoveEventHandler = new EventGateKeeper<Mouse.StandardMouseEvent>((e) => this._onMouseDownThenMove(e), () => !this.viewHelper.isDirty());
		this.toDispose.push(this._mouseDownThenMoveEventHandler);

		this.listenersToRemove.push(DomUtils.addListener(this.viewHelper.viewDomNode, 'mouseup',
			(e: MouseEvent) => this._onMouseUp(e)));

		this.listenersToRemove.push(DomUtils.addNonBubblingMouseOutListener(this.viewHelper.viewDomNode,
			(e:MouseEvent) => this._onMouseLeave(e)));

		this.listenersToRemove.push(DomUtils.addListener(this.viewHelper.viewDomNode, 'mousedown',
			(e: MouseEvent) => this._onMouseDown(e)));


		this.context.addEventHandler(this);
	}

	public dispose(): void {
		this.context.removeEventHandler(this);
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		this._unhook();
		if (this.hideTextAreaTimeout !== -1) {
			window.clearTimeout(this.hideTextAreaTimeout);
			this.hideTextAreaTimeout = -1;
		}
	}

	// --- begin event handlers
	_layoutInfo:EditorCommon.IEditorLayoutInfo;
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this._layoutInfo = layoutInfo;
		return false;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		if (this.mouseMoveMonitor.isMonitoring()) {
			this._hookedOnScroll(e);
		}
		return false;
	}
	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.currentSelection = e.selection;
		return false;
	}
	// --- end event handlers

	protected _createMouseTarget(e:Mouse.StandardMouseEvent, testEventTarget:boolean): EditorBrowser.IMouseTarget {
		var editorContent = DomUtils.getDomNodePosition(this.viewHelper.viewDomNode);
		return this.mouseTargetFactory.createMouseTarget(this._layoutInfo, editorContent, e, testEventTarget);
	}

	private _onContextMenu(rawEvent: MouseEvent): void {
		var e = new Mouse.StandardMouseEvent(rawEvent);
		var t = this._createMouseTarget(e, true);
		var mouseEvent: EditorBrowser.IMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitContextMenu(mouseEvent);
	}

	private _onMouseMove(e: Mouse.StandardMouseEvent): void {
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
		var mouseEvent: EditorBrowser.IMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseMove(mouseEvent);
	}

	private _onMouseLeave(rawEvent: MouseEvent): void {
		this.lastMouseLeaveTime = (new Date()).getTime();
		var mouseEvent: EditorBrowser.IMouseEvent = {
			event: new Mouse.StandardMouseEvent(rawEvent),
			target: null
		};
		this.viewController.emitMouseLeave(mouseEvent);
	}

	public _onMouseUp(rawEvent: MouseEvent): void {
		var e = new Mouse.StandardMouseEvent(rawEvent);
		var t = this._createMouseTarget(e, true);

		var mouseEvent: EditorBrowser.IMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseUp(mouseEvent);
	}

	public _onMouseDown(rawEvent: MouseEvent): void {
		var e = new Mouse.StandardMouseEvent(rawEvent);
		var t = this._createMouseTarget(e, true);

		var targetIsContent = (t.type === EditorCommon.MouseTargetType.CONTENT_TEXT || t.type === EditorCommon.MouseTargetType.CONTENT_EMPTY);
		var targetIsGutter = (t.type === EditorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === EditorCommon.MouseTargetType.GUTTER_LINE_NUMBERS || t.type === EditorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS);
		var targetIsLineNumbers = (t.type === EditorCommon.MouseTargetType.GUTTER_LINE_NUMBERS);
		var selectOnLineNumbers = this.context.configuration.editor.selectOnLineNumbers;
		var targetIsViewZone = (t.type === EditorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === EditorCommon.MouseTargetType.GUTTER_VIEW_ZONE);

		var shouldHandle = e.leftButton;
		if (Platform.isMacintosh && e.ctrlKey) {
			shouldHandle = false;
		}

		if (shouldHandle && (targetIsContent || (targetIsLineNumbers && selectOnLineNumbers))) {
			if (Browser.isIE11orEarlier) {
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
			var viewZoneData = <EditorBrowser.IViewZoneData>t.detail;
			if (this.viewHelper.shouldSuppressMouseDownOnViewZone(viewZoneData.viewZoneId)) {
				e.preventDefault();
			}
		}

		var mouseEvent: EditorBrowser.IMouseEvent = {
			event: e,
			target: t
		};
		this.viewController.emitMouseDown(mouseEvent);
	}

	private _hookedOnScroll(rawEvent:EditorCommon.IScrollEvent): void {
		if (this.onScrollTimeout === -1) {
			this.onScrollTimeout = window.setTimeout(() => {
				this.onScrollTimeout = -1;
				this._updateMouse(this.monitoringStartTargetType, null, true);
			}, 10);
		}
	}

	private _hook(startTargetType:EditorCommon.MouseTargetType): void {
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

	private _onMouseDownThenMove(e:Mouse.StandardMouseEvent): void {
		this._updateMouse(this.monitoringStartTargetType, e, true);
	}

	private _unhook(): void {
		if (this.onScrollTimeout !== -1) {
			window.clearTimeout(this.onScrollTimeout);
			this.onScrollTimeout = -1;
		}
	}

	private _getPositionOutsideEditor(editorContent: MouseTarget.IDomNodePosition, e: Mouse.StandardMouseEvent): EditorCommon.IPosition {
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

	private _updateMouse(startTargetType:EditorCommon.MouseTargetType, e:Mouse.StandardMouseEvent, inSelectionMode:boolean, setMouseDownCount:number = 0): void {
		e = e || this.lastMouseEvent;
		this.lastMouseEvent = e;

		var editorContent = DomUtils.getDomNodePosition(this.viewHelper.viewDomNode);
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

			if (t.type === EditorCommon.MouseTargetType.CONTENT_VIEW_ZONE || t.type === EditorCommon.MouseTargetType.GUTTER_VIEW_ZONE) {
				// Force position on view zones to go above or below depending on where selection started from
				if (this.lastMouseDownCount > 0) {
					var selectionStart = new Position(this.currentSelection.selectionStartLineNumber, this.currentSelection.selectionStartColumn);
					var viewZoneData = <EditorBrowser.IViewZoneData>t.detail;
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

		if (startTargetType === EditorCommon.MouseTargetType.GUTTER_LINE_NUMBERS) {
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
