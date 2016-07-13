/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Disposable} from 'vs/base/common/lifecycle';
import Event, {Emitter} from 'vs/base/common/event';

export enum ScrollbarVisibility {
	Auto = 1,
	Hidden = 2,
	Visible = 3
}

export interface ScrollEvent {
	width: number;
	scrollWidth: number;
	scrollLeft: number;

	height: number;
	scrollHeight: number;
	scrollTop: number;

	widthChanged: boolean;
	scrollWidthChanged: boolean;
	scrollLeftChanged: boolean;

	heightChanged: boolean;
	scrollHeightChanged: boolean;
	scrollTopChanged: boolean;
}

export interface INewScrollState {
	width?: number;
	scrollWidth?: number;
	scrollLeft?: number;

	height?: number;
	scrollHeight?: number;
	scrollTop?: number;
}

export class Scrollable extends Disposable {

	_scrollableBrand: void;

	private _width: number;
	private _scrollWidth: number;
	private _scrollLeft: number;

	private _height: number;
	private _scrollHeight: number;
	private _scrollTop: number;

	private _onScroll = this._register(new Emitter<ScrollEvent>());
	public onScroll: Event<ScrollEvent> = this._onScroll.event;

	constructor() {
		super();

		this._width = 0;
		this._scrollWidth = 0;
		this._scrollLeft = 0;

		this._height = 0;
		this._scrollHeight = 0;
		this._scrollTop = 0;
	}

	public getWidth(): number {
		return this._width;
	}
	public getScrollWidth(): number {
		return this._scrollWidth;
	}
	public getScrollLeft(): number {
		return this._scrollLeft;
	}

	public getHeight(): number {
		return this._height;
	}
	public getScrollHeight(): number {
		return this._scrollHeight;
	}
	public getScrollTop(): number {
		return this._scrollTop;
	}

	public updateState(newState:INewScrollState): void {
		let width = (typeof newState.width !== 'undefined' ? newState.width|0 : this._width);
		let scrollWidth = (typeof newState.scrollWidth !== 'undefined' ? newState.scrollWidth|0 : this._scrollWidth);
		let scrollLeft = (typeof newState.scrollLeft !== 'undefined' ? newState.scrollLeft|0 : this._scrollLeft);

		let height = (typeof newState.height !== 'undefined' ? newState.height|0 : this._height);
		let scrollHeight = (typeof newState.scrollHeight !== 'undefined' ? newState.scrollHeight|0 : this._scrollHeight);
		let scrollTop = (typeof newState.scrollTop !== 'undefined' ? newState.scrollTop|0 : this._scrollTop);

		if (width < 0) {
			width = 0;
		}
		if (scrollLeft + width > scrollWidth) {
			scrollLeft = scrollWidth - width;
		}
		if (scrollLeft < 0) {
			scrollLeft = 0;
		}

		if (height < 0) {
			height = 0;
		}
		if (scrollTop + height > scrollHeight) {
			scrollTop = scrollHeight - height;
		}
		if (scrollTop < 0) {
			scrollTop = 0;
		}

		let widthChanged = (this._width !== width);
		let scrollWidthChanged = (this._scrollWidth !== scrollWidth);
		let scrollLeftChanged = (this._scrollLeft !== scrollLeft);

		let heightChanged = (this._height !== height);
		let scrollHeightChanged = (this._scrollHeight !== scrollHeight);
		let scrollTopChanged = (this._scrollTop !== scrollTop);

		if (!widthChanged && !scrollWidthChanged && !scrollLeftChanged && !heightChanged && !scrollHeightChanged && !scrollTopChanged) {
			return;
		}

		this._width = width;
		this._scrollWidth = scrollWidth;
		this._scrollLeft = scrollLeft;

		this._height = height;
		this._scrollHeight = scrollHeight;
		this._scrollTop = scrollTop;

		this._onScroll.fire({
			width: this._width,
			scrollWidth: this._scrollWidth,
			scrollLeft: this._scrollLeft,

			height: this._height,
			scrollHeight: this._scrollHeight,
			scrollTop: this._scrollTop,

			widthChanged: widthChanged,
			scrollWidthChanged: scrollWidthChanged,
			scrollLeftChanged: scrollLeftChanged,

			heightChanged: heightChanged,
			scrollHeightChanged: scrollHeightChanged,
			scrollTopChanged: scrollTopChanged,
		});
	}
}
