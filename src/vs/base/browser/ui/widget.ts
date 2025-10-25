/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../dom.js';
import { IKeyboardEvent, StandardKeyboardEvent } from '../keyboardEvent.js';
import { IMouseEvent, StandardMouseEvent } from '../mouseEvent.js';
import { Gesture } from '../touch.js';
import { Disposable, IDisposable } from '../../common/lifecycle.js';

export abstract class Widget extends Disposable {

	protected onclick(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.CLICK, (e: MouseEvent) => listener(new StandardMouseEvent(dom.getWindow(domNode), e))));
	}

	protected onmousedown(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => listener(new StandardMouseEvent(dom.getWindow(domNode), e))));
	}

	protected onmouseover(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.MOUSE_OVER, (e: MouseEvent) => listener(new StandardMouseEvent(dom.getWindow(domNode), e))));
	}

	protected onmouseleave(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.MOUSE_LEAVE, (e: MouseEvent) => listener(new StandardMouseEvent(dom.getWindow(domNode), e))));
	}

	protected onkeydown(domNode: HTMLElement, listener: (e: IKeyboardEvent) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => listener(new StandardKeyboardEvent(e))));
	}

	protected onkeyup(domNode: HTMLElement, listener: (e: IKeyboardEvent) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.KEY_UP, (e: KeyboardEvent) => listener(new StandardKeyboardEvent(e))));
	}

	protected oninput(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.INPUT, listener));
	}

	protected onblur(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.BLUR, listener));
	}

	protected onfocus(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.FOCUS, listener));
	}

	protected onchange(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(dom.addDisposableListener(domNode, dom.EventType.CHANGE, listener));
	}

	protected ignoreGesture(domNode: HTMLElement): IDisposable {
		return Gesture.ignoreTarget(domNode);
	}
}
