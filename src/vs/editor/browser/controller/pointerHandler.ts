/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { EventType, Gesture, GestureEvent } from 'vs/base/browser/touch';
import { MouseHandler, IPointerHandlerHelper } from 'vs/editor/browser/controller/mouseHandler';
import { IViewController, IMouseTarget } from 'vs/editor/browser/editorBrowser';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { EditorMouseEvent } from 'vs/editor/browser/editorDom';

interface IThrottledGestureEvent {
	translationX: number;
	translationY: number;
}

function gestureChangeEventMerger(lastEvent: IThrottledGestureEvent, currentEvent: MSGestureEvent): IThrottledGestureEvent {
	let r = {
		translationY: currentEvent.translationY,
		translationX: currentEvent.translationX
	};
	if (lastEvent) {
		r.translationY += lastEvent.translationY;
		r.translationX += lastEvent.translationX;
	}
	return r;
};

/**
 * Basically IE10 and IE11
 */
class MsPointerHandler extends MouseHandler implements IDisposable {

	private _lastPointerType: string;
	private _installGestureHandlerTimeout: number;

	constructor(context: ViewContext, viewController: IViewController, viewHelper: IPointerHandlerHelper) {
		super(context, viewController, viewHelper);

		this.viewHelper.linesContentDomNode.style.msTouchAction = 'none';
		this.viewHelper.linesContentDomNode.style.msContentZooming = 'none';

		// TODO@Alex -> this expects that the view is added in 100 ms, might not be the case
		// This handler should be added when the dom node is in the dom tree
		this._installGestureHandlerTimeout = window.setTimeout(() => {
			this._installGestureHandlerTimeout = -1;
			if ((<any>window).MSGesture) {
				let touchGesture = new MSGesture();
				let penGesture = new MSGesture();
				touchGesture.target = this.viewHelper.linesContentDomNode;
				penGesture.target = this.viewHelper.linesContentDomNode;
				this.viewHelper.linesContentDomNode.addEventListener('MSPointerDown', (e: MSPointerEvent) => {
					// Circumvent IE11 breaking change in e.pointerType & TypeScript's stale definitions
					let pointerType = <any>e.pointerType;
					if (pointerType === ((<any>e).MSPOINTER_TYPE_MOUSE || 'mouse')) {
						this._lastPointerType = 'mouse';
						return;
					} else if (pointerType === ((<any>e).MSPOINTER_TYPE_TOUCH || 'touch')) {
						this._lastPointerType = 'touch';
						touchGesture.addPointer(e.pointerId);
					} else {
						this._lastPointerType = 'pen';
						penGesture.addPointer(e.pointerId);
					}
				});
				this.listenersToRemove.push(dom.addDisposableThrottledListener<IThrottledGestureEvent>(this.viewHelper.linesContentDomNode, 'MSGestureChange', (e) => this._onGestureChange(e), gestureChangeEventMerger));
				this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.linesContentDomNode, 'MSGestureTap', (e) => this._onCaptureGestureTap(e), true));
			}
		}, 100);
		this._lastPointerType = 'mouse';
	}

	public _onMouseDown(e: EditorMouseEvent): void {
		if (this._lastPointerType === 'mouse') {
			super._onMouseDown(e);
		}
	}

	private _onCaptureGestureTap(rawEvent: MSGestureEvent): void {
		let e = new EditorMouseEvent(<MouseEvent><any>rawEvent, this.viewHelper.viewDomNode);
		let t = this._createMouseTarget(e, false);
		if (t.position) {
			this.viewController.moveTo('mouse', t.position);
		}
		// IE does not want to focus when coming in from the browser's address bar
		if ((<any>e.browserEvent).fromElement) {
			e.preventDefault();
			this.viewHelper.focusTextArea();
		} else {
			// TODO@Alex -> cancel this is focus is lost
			setTimeout(() => {
				this.viewHelper.focusTextArea();
			});
		}
	}

	private _onGestureChange(e: IThrottledGestureEvent): void {
		this.viewHelper.setScrollPosition({
			scrollLeft: this.viewHelper.getScrollLeft() - e.translationX,
			scrollTop: this.viewHelper.getScrollTop() - e.translationY,
		});
	}

	public dispose(): void {
		window.clearTimeout(this._installGestureHandlerTimeout);
		super.dispose();
	}
}

/**
 * Basically Edge but should be modified to handle any pointerEnabled, even without support of MSGesture
 */
class StandardPointerHandler extends MouseHandler implements IDisposable {

	private _lastPointerType: string;
	private _installGestureHandlerTimeout: number;

	constructor(context: ViewContext, viewController: IViewController, viewHelper: IPointerHandlerHelper) {
		super(context, viewController, viewHelper);

		this.viewHelper.linesContentDomNode.style.touchAction = 'none';

		// TODO@Alex -> this expects that the view is added in 100 ms, might not be the case
		// This handler should be added when the dom node is in the dom tree
		this._installGestureHandlerTimeout = window.setTimeout(() => {
			this._installGestureHandlerTimeout = -1;

			// TODO@Alex: replace the usage of MSGesture here with something that works across all browsers
			if ((<any>window).MSGesture) {
				let touchGesture = new MSGesture();
				let penGesture = new MSGesture();
				touchGesture.target = this.viewHelper.linesContentDomNode;
				penGesture.target = this.viewHelper.linesContentDomNode;
				this.viewHelper.linesContentDomNode.addEventListener('pointerdown', (e: MSPointerEvent) => {
					let pointerType = <any>e.pointerType;
					if (pointerType === 'mouse') {
						this._lastPointerType = 'mouse';
						return;
					} else if (pointerType === 'touch') {
						this._lastPointerType = 'touch';
						touchGesture.addPointer(e.pointerId);
					} else {
						this._lastPointerType = 'pen';
						penGesture.addPointer(e.pointerId);
					}
				});
				this.listenersToRemove.push(dom.addDisposableThrottledListener<IThrottledGestureEvent>(this.viewHelper.linesContentDomNode, 'MSGestureChange', (e) => this._onGestureChange(e), gestureChangeEventMerger));
				this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.linesContentDomNode, 'MSGestureTap', (e) => this._onCaptureGestureTap(e), true));
			}
		}, 100);
		this._lastPointerType = 'mouse';
	}

	public _onMouseDown(e: EditorMouseEvent): void {
		if (this._lastPointerType === 'mouse') {
			super._onMouseDown(e);
		}
	}

	private _onCaptureGestureTap(rawEvent: MSGestureEvent): void {
		let e = new EditorMouseEvent(<MouseEvent><any>rawEvent, this.viewHelper.viewDomNode);
		let t = this._createMouseTarget(e, false);
		if (t.position) {
			this.viewController.moveTo('mouse', t.position);
		}
		// IE does not want to focus when coming in from the browser's address bar
		if ((<any>e.browserEvent).fromElement) {
			e.preventDefault();
			this.viewHelper.focusTextArea();
		} else {
			// TODO@Alex -> cancel this is focus is lost
			setTimeout(() => {
				this.viewHelper.focusTextArea();
			});
		}
	}

	private _onGestureChange(e: IThrottledGestureEvent): void {
		this.viewHelper.setScrollPosition({
			scrollLeft: this.viewHelper.getScrollLeft() - e.translationX,
			scrollTop: this.viewHelper.getScrollTop() - e.translationY,
		});
	}

	public dispose(): void {
		window.clearTimeout(this._installGestureHandlerTimeout);
		super.dispose();
	}
}

class TouchHandler extends MouseHandler {

	private gesture: Gesture;

	constructor(context: ViewContext, viewController: IViewController, viewHelper: IPointerHandlerHelper) {
		super(context, viewController, viewHelper);

		this.gesture = new Gesture(this.viewHelper.linesContentDomNode);

		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Tap, (e) => this.onTap(e)));
		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Change, (e) => this.onChange(e)));
		this.listenersToRemove.push(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Contextmenu, (e: MouseEvent) => this._onContextMenu(new EditorMouseEvent(e, this.viewHelper.viewDomNode), false)));

	}

	public dispose(): void {
		this.gesture.dispose();
		super.dispose();
	}

	private onTap(event: GestureEvent): void {
		event.preventDefault();

		this.viewHelper.focusTextArea();

		let target = this._createMouseTarget(new EditorMouseEvent(event, this.viewHelper.viewDomNode), false);

		if (target.position) {
			this.viewController.moveTo('mouse', target.position);
		}
	}

	private onChange(e: GestureEvent): void {
		this.viewHelper.setScrollPosition({
			scrollLeft: this.viewHelper.getScrollLeft() - e.translationX,
			scrollTop: this.viewHelper.getScrollTop() - e.translationY,
		});
	}
}

export class PointerHandler implements IDisposable {
	private handler: MouseHandler;

	constructor(context: ViewContext, viewController: IViewController, viewHelper: IPointerHandlerHelper) {
		if (window.navigator.msPointerEnabled) {
			this.handler = new MsPointerHandler(context, viewController, viewHelper);
		} else if ((<any>window).TouchEvent) {
			this.handler = new TouchHandler(context, viewController, viewHelper);
		} else if (window.navigator.pointerEnabled) {
			this.handler = new StandardPointerHandler(context, viewController, viewHelper);
		} else {
			this.handler = new MouseHandler(context, viewController, viewHelper);
		}
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget {
		return this.handler.getTargetAtClientPoint(clientX, clientY);
	}

	public dispose(): void {
		this.handler.dispose();
	}
}
