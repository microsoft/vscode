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

export class VerticalScrollbar extends AbstractScrollbar {

	constructor(scrollable: Scrollable, options: ScrollableElementResolvedOptions, host: ScrollbarHost) {
		super({
			lazyRender: options.lazyRender,
			host: host,
			scrollbarState: new ScrollbarState(
				(options.verticalHasArrows ? options.arrowSize : 0),
				(options.vertical === ScrollbarVisibility.Hidden ? 0 : options.verticalScrollbarSize),
				// give priority to vertical scroll bar over horizontal and let it scroll all the way to the bottom
				0
			),
			visibility: options.vertical,
			extraScrollbarClassName: 'vertical',
			scrollable: scrollable
		});

		if (options.verticalHasArrows) {
			let arrowDelta = (options.arrowSize - ARROW_IMG_SIZE) / 2;
			let scrollbarDelta = (options.verticalScrollbarSize - ARROW_IMG_SIZE) / 2;

			this._createArrow({
				className: 'up-arrow',
				top: arrowDelta,
				left: scrollbarDelta,
				bottom: void 0,
				right: void 0,
				bgWidth: options.verticalScrollbarSize,
				bgHeight: options.arrowSize,
				onActivate: () => this._host.onMouseWheel(new StandardMouseWheelEvent(null, 0, 1)),
			});

			this._createArrow({
				className: 'down-arrow',
				top: void 0,
				left: scrollbarDelta,
				bottom: arrowDelta,
				right: void 0,
				bgWidth: options.verticalScrollbarSize,
				bgHeight: options.arrowSize,
				onActivate: () => this._host.onMouseWheel(new StandardMouseWheelEvent(null, 0, -1)),
			});
		}

		this._createSlider(0, Math.floor((options.verticalScrollbarSize - options.verticalSliderSize) / 2), options.verticalSliderSize, null);
	}

	protected _updateSlider(sliderSize: number, sliderPosition: number): void {
		this.slider.setHeight(sliderSize);
		this.slider.setTop(sliderPosition);
	}

	protected _renderDomNode(largeSize: number, smallSize: number): void {
		this.domNode.setWidth(smallSize);
		this.domNode.setHeight(largeSize);
		this.domNode.setRight(0);
		this.domNode.setTop(0);
	}

	public onDidScroll(e: ScrollEvent): boolean {
		this._shouldRender = this._onElementScrollSize(e.scrollHeight) || this._shouldRender;
		this._shouldRender = this._onElementScrollPosition(e.scrollTop) || this._shouldRender;
		this._shouldRender = this._onElementSize(e.height) || this._shouldRender;
		return this._shouldRender;
	}

	protected _mouseDownRelativePosition(offsetX: number, offsetY: number): number {
		return offsetY;
	}

	protected _sliderMousePosition(e: ISimplifiedMouseEvent): number {
		return e.posy;
	}

	protected _sliderOrthogonalMousePosition(e: ISimplifiedMouseEvent): number {
		return e.posx;
	}

	public writeScrollPosition(target: INewScrollPosition, scrollPosition: number): void {
		target.scrollTop = scrollPosition;
	}
}
