/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Browser from 'vs/base/browser/browser';
import {AbstractScrollbar, ScrollbarHost, IMouseMoveEventData} from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import {IMouseEvent, StandardMouseWheelEvent} from 'vs/base/browser/mouseEvent';
import {IDomNodePosition} from 'vs/base/browser/dom';
import {ScrollableElementResolvedOptions, Visibility} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {DelegateScrollable} from 'vs/base/common/scrollable';
import {ScrollbarState} from 'vs/base/browser/ui/scrollbar/scrollbarState';
import {ARROW_IMG_SIZE} from 'vs/base/browser/ui/scrollbar/scrollbarArrow';

export class HorizontalScrollbar extends AbstractScrollbar {

	constructor(scrollable: DelegateScrollable, options: ScrollableElementResolvedOptions, host: ScrollbarHost) {
		super({
			forbidTranslate3dUse: options.forbidTranslate3dUse,
			lazyRender: options.lazyRender,
			host: host,
			scrollbarState: new ScrollbarState(
				(options.horizontalHasArrows ? options.arrowSize : 0),
				(options.horizontal === Visibility.Hidden ? 0 : options.horizontalScrollbarSize),
				(options.vertical === Visibility.Hidden ? 0 : options.verticalScrollbarSize)
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
		if (!this._forbidTranslate3dUse && Browser.canUseTranslate3d) {
			this.slider.setTransform('translate3d(' + sliderPosition + 'px, 0px, 0px)');
		} else {
			this.slider.setLeft(sliderPosition);
		}
	}

	protected _renderDomNode(largeSize: number, smallSize: number): void {
		this.domNode.setWidth(largeSize);
		this.domNode.setHeight(smallSize);
		this.domNode.setLeft(0);
		this.domNode.setBottom(0);
	}

	protected _mouseDownRelativePosition(e: IMouseEvent, domNodePosition: IDomNodePosition): number {
		return e.posx - domNodePosition.left;
	}

	protected _sliderMousePosition(e: IMouseMoveEventData): number {
		return e.posx;
	}

	protected _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number {
		return e.posy;
	}

	protected _getScrollPosition(): number {
		return this._scrollable.getScrollLeft();
	}

	protected _setScrollPosition(scrollPosition: number) {
		this._scrollable.setScrollLeft(scrollPosition);
	}
}
