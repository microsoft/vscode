/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserFeatures } from '../../../base/browser/canIUse.js';
import * as dom from '../../../base/browser/dom.js';
import { EventType, Gesture, GestureEvent } from '../../../base/browser/touch.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import * as platform from '../../../base/common/platform.js';
import { IPointerHandlerHelper, MouseHandler } from './mouseHandler.js';
import { IMouseTarget } from '../editorBrowser.js';
import { EditorMouseEvent, EditorPointerEventFactory } from '../editorDom.js';
import { ViewController } from '../view/viewController.js';
import { ViewContext } from '../../common/viewModel/viewContext.js';
import { TextAreaSyntethicEvents } from './editContext/textArea/textAreaEditContextInput.js';

/**
 * Currently only tested on iOS 13/ iPadOS.
 */
export class PointerEventHandler extends MouseHandler {
	private _lastPointerType: string;
	constructor(context: ViewContext, viewController: ViewController, viewHelper: IPointerHandlerHelper) {
		super(context, viewController, viewHelper);

		this._register(Gesture.addTarget(this.viewHelper.linesContentDomNode));
		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Tap, (e) => this.onTap(e)));
		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Change, (e) => this.onChange(e)));
		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Contextmenu, (e: MouseEvent) => this._onContextMenu(new EditorMouseEvent(e, false, this.viewHelper.viewDomNode), false)));

		this._lastPointerType = 'mouse';

		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, 'pointerdown', (e: PointerEvent) => {
			const pointerType = e.pointerType;
			if (pointerType === 'mouse') {
				this._lastPointerType = 'mouse';
				return;
			} else if (pointerType === 'touch') {
				this._lastPointerType = 'touch';
			} else {
				this._lastPointerType = 'pen';
			}
		}));

		// PonterEvents
		const pointerEvents = new EditorPointerEventFactory(this.viewHelper.viewDomNode);

		this._register(pointerEvents.onPointerMove(this.viewHelper.viewDomNode, (e) => this._onMouseMove(e)));
		this._register(pointerEvents.onPointerUp(this.viewHelper.viewDomNode, (e) => this._onMouseUp(e)));
		this._register(pointerEvents.onPointerLeave(this.viewHelper.viewDomNode, (e) => this._onMouseLeave(e)));
		this._register(pointerEvents.onPointerDown(this.viewHelper.viewDomNode, (e, pointerId) => this._onMouseDown(e, pointerId)));
	}

	private onTap(event: GestureEvent): void {
		if (!event.initialTarget || !this.viewHelper.linesContentDomNode.contains(event.initialTarget as HTMLElement)) {
			return;
		}

		event.preventDefault();

		// Dispatch the gesture first to handle cursor positioning and word selection
		// before focusing the textarea. This ensures double-tap word selection works
		// correctly on iOS/iPadOS.
		this._dispatchGesture(event, /*inSelectionMode*/false);

		// Focus the textarea after dispatching the gesture.
		// On iOS/iPadOS, this focus call happens in direct response to user touch,
		// which is required for the on-screen keyboard to appear.
		this.viewHelper.focusTextArea();
	}

	private onChange(event: GestureEvent): void {
		if (this._lastPointerType === 'touch') {
			this._context.viewModel.viewLayout.deltaScrollNow(-event.translationX, -event.translationY);
		}
		if (this._lastPointerType === 'pen') {
			this._dispatchGesture(event, /*inSelectionMode*/true);
		}
	}

	protected override _onMouseDown(e: EditorMouseEvent, pointerId: number): void {
		if ((e.browserEvent as PointerEvent).pointerType === 'touch') {
			return;
		}

		super._onMouseDown(e, pointerId);
	}
}

class TouchHandler extends MouseHandler {

	constructor(context: ViewContext, viewController: ViewController, viewHelper: IPointerHandlerHelper) {
		super(context, viewController, viewHelper);

		this._register(Gesture.addTarget(this.viewHelper.linesContentDomNode));

		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Tap, (e) => this.onTap(e)));
		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Change, (e) => this.onChange(e)));
		this._register(dom.addDisposableListener(this.viewHelper.linesContentDomNode, EventType.Contextmenu, (e: MouseEvent) => this._onContextMenu(new EditorMouseEvent(e, false, this.viewHelper.viewDomNode), false)));
	}

	private onTap(event: GestureEvent): void {
		event.preventDefault();

		// Send the tap event also to the <textarea> (for input purposes)
		const syntheticEvent = document.createEvent('CustomEvent');
		syntheticEvent.initEvent(TextAreaSyntethicEvents.Tap, false, true);
		this.viewHelper.dispatchTextAreaEvent(syntheticEvent);

		// Dispatch gesture to handle cursor positioning and word selection
		this._dispatchGesture(event, /*inSelectionMode*/false);

		// Focus the textarea after dispatching the gesture.
		// This ensures double-tap word selection works correctly,
		// and the keyboard appears on touch devices.
		this.viewHelper.focusTextArea();
	}

	private onChange(e: GestureEvent): void {
		this._context.viewModel.viewLayout.deltaScrollNow(-e.translationX, -e.translationY);
	}
}

export class PointerHandler extends Disposable {
	private readonly handler: MouseHandler;

	constructor(context: ViewContext, viewController: ViewController, viewHelper: IPointerHandlerHelper) {
		super();
		const isPhone = platform.isIOS || (platform.isAndroid && platform.isMobile);
		if (isPhone && BrowserFeatures.pointerEvents) {
			this.handler = this._register(new PointerEventHandler(context, viewController, viewHelper));
		} else if (mainWindow.TouchEvent) {
			this.handler = this._register(new TouchHandler(context, viewController, viewHelper));
		} else {
			this.handler = this._register(new MouseHandler(context, viewController, viewHelper));
		}
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget | null {
		return this.handler.getTargetAtClientPoint(clientX, clientY);
	}
}
