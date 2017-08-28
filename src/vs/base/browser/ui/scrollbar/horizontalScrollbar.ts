/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { AbstractScrollbar, ScrollbarHost, ISimplifiedMouseEvent } from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import { StandardMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { ScrollableElementResolvedOptions } from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import { Scrollable, ScrollEvent, ScrollbarVisibility, INewScrollPosition } from 'vs/base/common/scrollable';
import { ScrollbarState } from 'vs/base/browser/ui/scrollbar/scrollbarState';
import { ARROW_IMG_SIZE } from 'vs/base/browser/ui/scrollbar/scrollbarArrow';

export class HorizontalScrollbar extends AbstractScrollbar {

	constructor(scrollable: Scrollable, options: ScrollableElementResolvedOptions, host: ScrollbarHost) {
		super({
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
		this.slider.setLeft(sliderPosition);
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

	protected _mouseDownRelativePosition(offsetX: number, offsetY: number): number {
		return offsetX;
	}

	protected _sliderMousePosition(e: ISimplifiedMouseEvent): number {
		return e.posx;
	}

	protected _sliderOrthogonalMousePosition(e: ISimplifiedMouseEvent): number {
		return e.posy;
	}

	public writeScrollPosition(target: INewScrollPosition, scrollPosition: number): void {
		target.scrollLeft = scrollPosition;
	}
}
