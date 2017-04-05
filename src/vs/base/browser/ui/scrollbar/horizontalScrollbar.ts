/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { AbstractScrollbar, ScrollbarHost, IMouseMoveEventData } from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import { IMouseEvent, StandardMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IDomNodePagePosition } from 'vs/base/browser/dom';
import { ScrollableElementResolvedOptions } from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import { Scrollable, ScrollEvent, ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ScrollbarState } from 'vs/base/browser/ui/scrollbar/scrollbarState';
import { ARROW_IMG_SIZE } from 'vs/base/browser/ui/scrollbar/scrollbarArrow';

export class HorizontalScrollbar extends AbstractScrollbar {

	constructor(scrollable: Scrollable, options: ScrollableElementResolvedOptions, host: ScrollbarHost) {
		super({
			canUseTranslate3d: options.canUseTranslate3d,
			lazyRender: options.lazyRender,
			host: host,
			scrollbarState: new ScrollbarState(
				(options.horizontalHasArrows ? options.arrowSize : 0),
				(options.horizontal === ScrollbarVisibility.Hidden ? 0 : options.horizontalScrollbarSize),
				(options.vertical === ScrollbarVisibility.Hidden ? 0 : options.verticalScrollbarSize)
			),
			visibility: options.horizontal,
			extraScrollbarClassName: 'horizontal',
			scrollable: scrollable
		});

		if (options.horizontalHasArrows) {
			let arrowDelta = (options.arrowSize - ARROW_IMG_SIZE) / 2;
			let scrollbarDelta = (options.horizontalScrollbarSize - ARROW_IMG_SIZE) / 2;

			this._createArrow({
				className: 'left-arrow',
				top: scrollbarDelta,
				left: arrowDelta,
				bottom: void 0,
				right: void 0,
				bgWidth: options.arrowSize,
				bgHeight: options.horizontalScrollbarSize,
				onActivate: () => this._host.onMouseWheel(new StandardMouseWheelEvent(null, 1, 0)),
			});

			this._createArrow({
				className: 'right-arrow',
				top: scrollbarDelta,
				left: void 0,
				bottom: void 0,
				right: arrowDelta,
				bgWidth: options.arrowSize,
				bgHeight: options.horizontalScrollbarSize,
				onActivate: () => this._host.onMouseWheel(new StandardMouseWheelEvent(null, -1, 0)),
			});
		}

		this._createSlider(Math.floor((options.horizontalScrollbarSize - options.horizontalSliderSize) / 2), 0, null, options.horizontalSliderSize);
	}

	protected _updateSlider(sliderSize: number, sliderPosition: number): void {
		this.slider.setWidth(sliderSize);
		if (this._canUseTranslate3d) {
			this.slider.setTransform('translate3d(' + sliderPosition + 'px, 0px, 0px)');
			this.slider.setLeft(0);
		} else {
			this.slider.setTransform('');
			this.slider.setLeft(sliderPosition);
		}
	}

	protected _renderDomNode(largeSize: number, smallSize: number): void {
		this.domNode.setWidth(largeSize);
		this.domNode.setHeight(smallSize);
		this.domNode.setLeft(0);
		this.domNode.setBottom(0);
	}

	public onDidScroll(e: ScrollEvent): boolean {
		this._shouldRender = this._onElementScrollSize(e.scrollWidth) || this._shouldRender;
		this._shouldRender = this._onElementScrollPosition(e.scrollLeft) || this._shouldRender;
		this._shouldRender = this._onElementSize(e.width) || this._shouldRender;
		return this._shouldRender;
	}

	protected _mouseDownRelativePosition(e: IMouseEvent, domNodePosition: IDomNodePagePosition): number {
		return e.posx - domNodePosition.left;
	}

	protected _sliderMousePosition(e: IMouseMoveEventData): number {
		return e.posx;
	}

	protected _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number {
		return e.posy;
	}

	protected _getScrollPosition(): number {
		const scrollState = this._scrollable.getState();
		return scrollState.scrollLeft;
	}

	protected _setScrollPosition(scrollPosition: number) {
		this._scrollable.updateState({
			scrollLeft: scrollPosition
		});
	}
}
