/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Disposable, IDisposable} from 'vs/base/common/lifecycle';

export interface IScrollable {
	getScrollHeight():number;
	getScrollWidth():number;
	getScrollLeft():number;
	setScrollLeft(scrollLeft:number);
	getScrollTop():number;
	setScrollTop(scrollTop:number);
	addScrollListener(callback:(newValues:ScrollEvent)=>void): IDisposable;
}

export class ScrollEvent {
	_scrollEventTrait: void;

	scrollTop: number;
	scrollLeft: number;
	scrollWidth: number;
	scrollHeight: number;

	scrollTopChanged: boolean;
	scrollLeftChanged: boolean;
	scrollWidthChanged: boolean;
	scrollHeightChanged: boolean;

	constructor(scrollTop:number, scrollLeft:number, scrollWidth:number, scrollHeight:number, scrollTopChanged = false, scrollLeftChanged = false, scrollWidthChanged = false, scrollHeightChanged = false) {
		this.scrollTop = Math.round(scrollTop);
		this.scrollLeft = Math.round(scrollLeft);
		this.scrollWidth = Math.round(scrollWidth);
		this.scrollHeight = Math.round(scrollHeight);

		this.scrollTopChanged = scrollTopChanged;
		this.scrollLeftChanged = scrollLeftChanged;
		this.scrollWidthChanged = scrollWidthChanged;
		this.scrollHeightChanged = scrollHeightChanged;
	}

	public create(scrollTop:number, scrollLeft:number, scrollWidth:number, scrollHeight:number): ScrollEvent {
		return new ScrollEvent(
			scrollTop, scrollLeft, scrollWidth, scrollHeight,
			scrollTop !== this.scrollTop,
			scrollLeft !== this.scrollLeft,
			scrollWidth !== this.scrollWidth,
			scrollHeight !== this.scrollHeight
		);
	}
}

export class ScrollableValues {
	_scrollableValuesTrait: void;

	scrollTop: number;
	scrollLeft: number;
	scrollWidth: number;
	scrollHeight: number;

	constructor(scrollTop:number, scrollLeft:number, scrollWidth:number, scrollHeight:number) {
		this.scrollTop = Math.round(scrollTop);
		this.scrollLeft = Math.round(scrollLeft);
		this.scrollWidth = Math.round(scrollWidth);
		this.scrollHeight = Math.round(scrollHeight);
	}

	public equals(other:ScrollEvent): boolean {
		return (
			this.scrollTop === other.scrollTop
			&& this.scrollLeft === other.scrollLeft
			&& this.scrollWidth === other.scrollWidth
			&& this.scrollHeight === other.scrollHeight
		);
	}
}

export class DelegateScrollable extends Disposable {

	private _actual:IScrollable;
	private _onChange:()=>void;

	private _values: ScrollableValues;

	constructor(actual:IScrollable, onChange:()=>void) {
		super();
		this._actual = actual;
		this._onChange = onChange;

		this._values = new ScrollableValues(this._actual.getScrollTop(), this._actual.getScrollLeft(), this._actual.getScrollWidth(), this._actual.getScrollHeight());
		this._register(this._actual.addScrollListener((newValues) => this._update(newValues)));
	}

	public dispose(): void {
		super.dispose();
	}

	private _update(e:ScrollEvent): void {
		if (this._values.equals(e)) {
			return;
		}

		this._values = new ScrollableValues(e.scrollTop, e.scrollLeft, e.scrollWidth, e.scrollHeight);

		this._onChange();
	}

	public getScrollTop():number { return this._values.scrollTop; }
	public getScrollLeft():number { return this._values.scrollLeft; }
	public getScrollWidth():number { return this._values.scrollWidth; }
	public getScrollHeight():number { return this._values.scrollHeight; }

	public setScrollTop(scrollTop:number): void {
		this._actual.setScrollTop(scrollTop);
	}

	public setScrollLeft(scrollLeft:number): void {
		this._actual.setScrollLeft(scrollLeft);
	}
}
