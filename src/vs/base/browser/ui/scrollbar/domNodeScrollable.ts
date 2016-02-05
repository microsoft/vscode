/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as DomUtils from 'vs/base/browser/dom';
import {Gesture} from 'vs/base/browser/touch';
import {Disposable, IDisposable} from 'vs/base/common/lifecycle';
import {IScrollable} from 'vs/base/common/scrollable';
import {Emitter} from 'vs/base/common/event';

export class DomNodeScrollable extends Disposable implements IScrollable {

	private _domNode: HTMLElement;
	private _gestureHandler: Gesture;
	private _onScroll = this._register(new Emitter<void>());

	constructor(domNode: HTMLElement) {
		super();
		this._domNode = domNode;
		this._gestureHandler = this._register(new Gesture(this._domNode));
		this._register(DomUtils.addDisposableListener(this._domNode, 'scroll', (e) => this._onScroll.fire(void 0)));
	}

	public dispose() {
		this._domNode = null;
		super.dispose();
	}

	public getScrollHeight(): number {
		return this._domNode.scrollHeight;
	}

	public getScrollWidth(): number {
		return this._domNode.scrollWidth;
	}

	public getScrollLeft(): number {
		return this._domNode.scrollLeft;
	}

	public setScrollLeft(scrollLeft: number): void {
		this._domNode.scrollLeft = scrollLeft;
	}

	public getScrollTop(): number {
		return this._domNode.scrollTop;
	}

	public setScrollTop(scrollTop: number): void {
		this._domNode.scrollTop = scrollTop;
	}

	public addScrollListener(callback: () => void): IDisposable {
		return this._onScroll.event(callback);
	}
}
