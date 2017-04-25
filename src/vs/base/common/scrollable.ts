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

	public createUpdated(update: INewScrollState): ScrollState {
		return new ScrollState(
			(typeof update.width !== 'undefined' ? update.width : this.width),
			(typeof update.scrollWidth !== 'undefined' ? update.scrollWidth : this.scrollWidth),
			(typeof update.scrollLeft !== 'undefined' ? update.scrollLeft : this.scrollLeft),
			(typeof update.height !== 'undefined' ? update.height : this.height),
			(typeof update.scrollHeight !== 'undefined' ? update.scrollHeight : this.scrollHeight),
			(typeof update.scrollTop !== 'undefined' ? update.scrollTop : this.scrollTop)
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
	private _smoothScrolling: boolean;
	private _smoothScrollAnimationParams: ISmoothScrollAnimationParams;

	private _onScroll = this._register(new Emitter<ScrollEvent>());
	public onScroll: Event<ScrollEvent> = this._onScroll.event;

	constructor() {
		super();

		this._state = new ScrollState(0, 0, 0, 0, 0, 0);
		this._smoothScrolling = false;
		this._smoothScrollAnimationParams = null;
	}

	public getState(): ScrollState {
		return this._state;
	}

	/**
	 * Returns the final scroll state that the instance will have once the smooth scroll animation concludes.
	 * If no scroll animation is occurring, it will return the actual scroll state instead.
	 */
	public getSmoothScrollTargetState(): ScrollState {
		return this._smoothScrolling ? this._smoothScrollAnimationParams.newState : this._state;
	}

	public updateState(update: INewScrollState, smoothScrollDuration?: number): void {

		// If smooth scroll duration is not specified, then assume that the invoker intends to do an immediate update.
		if (smoothScrollDuration === undefined) {
			const newState = this._state.createUpdated(update);

			// If smooth scrolling is in progress, terminate it.
			if (this._smoothScrolling) {
				this._smoothScrolling = false;
				this._smoothScrollAnimationParams = null;
			}

			// Update state immediately if it is different from the previous one.
			if (!this._state.equals(newState)) {
				this._updateState(newState);
			}
		}
		// Otherwise update scroll state incrementally.
		else {
			const targetState = this.getSmoothScrollTargetState();
			const newTargetState = targetState.createUpdated(update);

			// Proceed only if the new target state differs from the current one.
			if (!targetState.equals(newTargetState)) {
				// Initialize/update smooth scroll parameters.
				this._smoothScrollAnimationParams = {
					oldState: this._state,
					newState: newTargetState,
					startTime: Date.now(),
					duration: smoothScrollDuration,
				};

				// Invoke smooth scrolling functionality in the next frame if it is not already in progress.
				if (!this._smoothScrolling) {
					this._smoothScrolling = true;
					requestAnimationFrame(() => { this._performSmoothScroll(); });
				}
			}
		}
	}

	private _performSmoothScroll(): void {
		if (!this._smoothScrolling) {
			// Smooth scrolling has been terminated.
			return;
		}

		const completion = (Date.now() - this._smoothScrollAnimationParams.startTime) / this._smoothScrollAnimationParams.duration;
		const newState = this._smoothScrollAnimationParams.newState;

		if (completion < 1) {
			const oldState = this._smoothScrollAnimationParams.oldState;
			this._updateState(new ScrollState(
				newState.width,
				newState.scrollWidth,
				oldState.scrollLeft + (newState.scrollLeft - oldState.scrollLeft) * completion,
				newState.height,
				newState.scrollHeight,
				oldState.scrollTop + (newState.scrollTop - oldState.scrollTop) * completion
			));
			requestAnimationFrame(() => { this._performSmoothScroll(); });
		}
		else {
			this._smoothScrolling = false;
			this._smoothScrollAnimationParams = null;
			this._updateState(newState);
		}
	}

	private _updateState(newState: ScrollState): void {
		const oldState = this._state;
		this._state = newState;
		this._onScroll.fire(this._state.createScrollEvent(oldState));
	}
}

interface ISmoothScrollAnimationParams {
	oldState: ScrollState;
	newState: ScrollState;
	startTime: number;
	duration: number;
}