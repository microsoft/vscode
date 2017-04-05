/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';

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

export class ScrollState {
	_scrollStateBrand: void;

	public readonly width: number;
	public readonly scrollWidth: number;
	public readonly scrollLeft: number;
	public readonly height: number;
	public readonly scrollHeight: number;
	public readonly scrollTop: number;

	constructor(
		width: number,
		scrollWidth: number,
		scrollLeft: number,
		height: number,
		scrollHeight: number,
		scrollTop: number
	) {
		width = width | 0;
		scrollWidth = scrollWidth | 0;
		scrollLeft = scrollLeft | 0;
		height = height | 0;
		scrollHeight = scrollHeight | 0;
		scrollTop = scrollTop | 0;

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

		this.width = width;
		this.scrollWidth = scrollWidth;
		this.scrollLeft = scrollLeft;
		this.height = height;
		this.scrollHeight = scrollHeight;
		this.scrollTop = scrollTop;
	}

	public equals(other: ScrollState): boolean {
		return (
			this.width === other.width
			&& this.scrollWidth === other.scrollWidth
			&& this.scrollLeft === other.scrollLeft
			&& this.height === other.height
			&& this.scrollHeight === other.scrollHeight
			&& this.scrollTop === other.scrollTop
		);
	}

	public createScrollEvent(previous: ScrollState): ScrollEvent {
		let widthChanged = (this.width !== previous.width);
		let scrollWidthChanged = (this.scrollWidth !== previous.scrollWidth);
		let scrollLeftChanged = (this.scrollLeft !== previous.scrollLeft);

		let heightChanged = (this.height !== previous.height);
		let scrollHeightChanged = (this.scrollHeight !== previous.scrollHeight);
		let scrollTopChanged = (this.scrollTop !== previous.scrollTop);

		return {
			width: this.width,
			scrollWidth: this.scrollWidth,
			scrollLeft: this.scrollLeft,

			height: this.height,
			scrollHeight: this.scrollHeight,
			scrollTop: this.scrollTop,

			widthChanged: widthChanged,
			scrollWidthChanged: scrollWidthChanged,
			scrollLeftChanged: scrollLeftChanged,

			heightChanged: heightChanged,
			scrollHeightChanged: scrollHeightChanged,
			scrollTopChanged: scrollTopChanged,
		};
	}

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

	private _state: ScrollState;

	private _onScroll = this._register(new Emitter<ScrollEvent>());
	public onScroll: Event<ScrollEvent> = this._onScroll.event;

	constructor() {
		super();

		this._state = new ScrollState(0, 0, 0, 0, 0, 0);
	}

	public getState(): ScrollState {
		return this._state;
	}

	public updateState(update: INewScrollState): void {
		const oldState = this._state;
		const newState = new ScrollState(
			(typeof update.width !== 'undefined' ? update.width : oldState.width),
			(typeof update.scrollWidth !== 'undefined' ? update.scrollWidth : oldState.scrollWidth),
			(typeof update.scrollLeft !== 'undefined' ? update.scrollLeft : oldState.scrollLeft),
			(typeof update.height !== 'undefined' ? update.height : oldState.height),
			(typeof update.scrollHeight !== 'undefined' ? update.scrollHeight : oldState.scrollHeight),
			(typeof update.scrollTop !== 'undefined' ? update.scrollTop : oldState.scrollTop)
		);

		if (oldState.equals(newState)) {
			// no change
			return;
		}

		this._state = newState;
		this._onScroll.fire(this._state.createScrollEvent(oldState));
	}
}
