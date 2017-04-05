/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { StandardMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { StandardKeyboardEvent, IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as DomUtils from 'vs/base/browser/dom';

export abstract class Widget extends Disposable {

	protected onclick(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.CLICK, (e: MouseEvent) => listener(new StandardMouseEvent(e))));
	}

	protected onmousedown(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.MOUSE_DOWN, (e: MouseEvent) => listener(new StandardMouseEvent(e))));
	}

	protected onmouseover(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.MOUSE_OVER, (e: MouseEvent) => listener(new StandardMouseEvent(e))));
	}

	protected onnonbubblingmouseout(domNode: HTMLElement, listener: (e: IMouseEvent) => void): void {
		this._register(DomUtils.addDisposableNonBubblingMouseOutListener(domNode, (e: MouseEvent) => listener(new StandardMouseEvent(e))));
	}

	protected onkeydown(domNode: HTMLElement, listener: (e: IKeyboardEvent) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.KEY_DOWN, (e: KeyboardEvent) => listener(new StandardKeyboardEvent(e))));
	}

	protected onkeyup(domNode: HTMLElement, listener: (e: IKeyboardEvent) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.KEY_UP, (e: KeyboardEvent) => listener(new StandardKeyboardEvent(e))));
	}

	protected oninput(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.INPUT, listener));
	}

	protected onblur(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.BLUR, listener));
	}

	protected onfocus(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.FOCUS, listener));
	}

	protected onchange(domNode: HTMLElement, listener: (e: Event) => void): void {
		this._register(DomUtils.addDisposableListener(domNode, DomUtils.EventType.CHANGE, listener));
	}
}
