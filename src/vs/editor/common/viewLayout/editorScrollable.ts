/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IScrollable, ScrollEvent} from 'vs/base/common/scrollable';

export class EditorScrollable extends EventEmitter implements IScrollable {

	private scrollTop: number;
	private scrollLeft: number;
	private scrollWidth: number;
	private scrollHeight: number;
	private width: number;
	private height: number;
	private _lastScrollEvent: ScrollEvent;

	constructor() {
		super([
			EditorScrollable._SCROLL_EVENT
		]);

		this.scrollTop = 0;
		this.scrollLeft = 0;
		this.scrollWidth = 0;
		this.scrollHeight = 0;
		this.width = 0;
		this.height = 0;

		this._lastScrollEvent = new ScrollEvent(this.getScrollTop(), this.getScrollLeft(), this.getScrollWidth(), this.getScrollHeight());
	}

	public dispose(): void {
		super.dispose();
	}

	// ------------ (visible) width

	public getWidth(): number {
		return this.width;
	}

	public setWidth(width: number): void {
		width = Math.floor(width);
		if (width < 0) {
			width = 0;
		}

		if (this.width !== width) {
			this.width = width;

			// Revalidate
			this.setScrollWidth(this.scrollWidth);
			this.setScrollLeft(this.scrollLeft);
		}
	}

	// ------------ scroll width

	public getScrollWidth(): number {
		return this.scrollWidth;
	}

	public setScrollWidth(scrollWidth:number): void {
		scrollWidth = Math.floor(scrollWidth);
		if (scrollWidth < this.width) {
			scrollWidth = this.width;
		}

		if (this.scrollWidth !== scrollWidth) {
			this.scrollWidth = scrollWidth;

			// Revalidate
			this.setScrollLeft(this.scrollLeft);

			this._emitScrollEvent();
		}
	}

	// ------------ scroll left

	public getScrollLeft(): number {
		return this.scrollLeft;
	}

	public setScrollLeft(scrollLeft:number): void {
		scrollLeft = Math.floor(scrollLeft);
		if (scrollLeft < 0) {
			scrollLeft = 0;
		}
		if (scrollLeft + this.width > this.scrollWidth) {
			scrollLeft = this.scrollWidth - this.width;
		}

		if (this.scrollLeft !== scrollLeft) {
			this.scrollLeft = scrollLeft;

			this._emitScrollEvent();
		}
	}

	// ------------ (visible) height

	public getHeight(): number {
		return this.height;
	}

	public setHeight(height: number): void {
		height = Math.floor(height);
		if (height < 0) {
			height = 0;
		}

		if (this.height !== height) {
			this.height = height;

			// Revalidate
			this.setScrollHeight(this.scrollHeight);
			this.setScrollTop(this.scrollTop);
		}
	}

	// ------------ scroll height

	public getScrollHeight(): number {
		return this.scrollHeight;
	}

	public setScrollHeight(scrollHeight: number): void {
		scrollHeight = Math.floor(scrollHeight);
		if (scrollHeight < this.height) {
			scrollHeight = this.height;
		}

		if (this.scrollHeight !== scrollHeight) {
			this.scrollHeight = scrollHeight;

			// Revalidate
			this.setScrollTop(this.scrollTop);

			this._emitScrollEvent();
		}
	}

	// ------------ scroll top

	public getScrollTop(): number {
		return this.scrollTop;
	}

	public setScrollTop(scrollTop:number): void {
		scrollTop = Math.floor(scrollTop);
		if (scrollTop < 0) {
			scrollTop = 0;
		}
		if (scrollTop + this.height > this.scrollHeight) {
			scrollTop = this.scrollHeight - this.height;
		}

		if (this.scrollTop !== scrollTop) {
			this.scrollTop = scrollTop;

			this._emitScrollEvent();
		}
	}

	// ------------ events

	static _SCROLL_EVENT = 'scroll';
	private _emitScrollEvent(): void {
		this._lastScrollEvent = this._lastScrollEvent.create(this.getScrollTop(), this.getScrollLeft(), this.getScrollWidth(), this.getScrollHeight());
		this.emit(EditorScrollable._SCROLL_EVENT, this._lastScrollEvent);
	}
	public addScrollListener(listener: (e:ScrollEvent) => void): IDisposable {
		return this.addListener2(EditorScrollable._SCROLL_EVENT, listener);
	}
}
