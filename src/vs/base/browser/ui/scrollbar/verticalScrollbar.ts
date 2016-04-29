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

export class VerticalScrollbar extends AbstractScrollbar {

	constructor(scrollable: DelegateScrollable, options: ScrollableElementResolvedOptions, host: ScrollbarHost) {
		super({
			forbidTranslate3dUse: options.forbidTranslate3dUse,
			lazyRender: options.lazyRender,
			host: host,
			scrollbarState: new ScrollbarState(
				(options.verticalHasArrows ? options.arrowSize : 0),
				(options.vertical === Visibility.Hidden ? 0 : options.verticalScrollbarSize),
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
		if (!this._forbidTranslate3dUse && Browser.canUseTranslate3d) {
			this.slider.setTransform('translate3d(0px, ' + sliderPosition + 'px, 0px)');
		} else {
			this.slider.setTop(sliderPosition);
		}
	}

	protected _renderDomNode(largeSize: number, smallSize: number): void {
		this.domNode.setWidth(smallSize);
		this.domNode.setHeight(largeSize);
		this.domNode.setRight(0);
		this.domNode.setTop(0);
	}

	protected _mouseDownRelativePosition(e: IMouseEvent, domNodePosition: IDomNodePosition): number {
		return e.posy - domNodePosition.top;
	}

	protected _sliderMousePosition(e: IMouseMoveEventData): number {
		return e.posy;
	}

	protected _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number {
		return e.posx;
	}

	protected _getScrollPosition(): number {
		return this._scrollable.getScrollTop();
	}

	protected _setScrollPosition(scrollPosition: number): void {
		this._scrollable.setScrollTop(scrollPosition);
	}
}
