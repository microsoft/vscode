/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Browser from 'vs/base/browser/browser';
import {ARROW_IMG_SIZE, AbstractScrollbar, ScrollbarState, IMouseMoveEventData} from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import {IMouseEvent, StandardMouseWheelEvent} from 'vs/base/browser/mouseEvent';
import {IDomNodePosition} from 'vs/base/browser/dom';
import {IParent, IScrollableElementOptions, Visibility} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {IScrollable} from 'vs/base/common/scrollable';
import {StyleMutator} from 'vs/base/browser/styleMutator';

export class HorizontalScrollbar extends AbstractScrollbar {

	private _scrollable: IScrollable;

	constructor(scrollable: IScrollable, parent: IParent, options: IScrollableElementOptions) {
		let s = new ScrollbarState(
			(options.horizontalHasArrows ? options.arrowSize : 0),
			(options.horizontal === Visibility.Hidden ? 0 : options.horizontalScrollbarSize),
			(options.vertical === Visibility.Hidden ? 0 : options.verticalScrollbarSize)
		);
		super(options.forbidTranslate3dUse, parent, s, options.horizontal, 'horizontal');
		this._scrollable = scrollable;

		this._createDomNode();
		if (options.horizontalHasArrows) {
			let arrowDelta = (options.arrowSize - ARROW_IMG_SIZE) / 2;
			let scrollbarDelta = (options.horizontalScrollbarSize - ARROW_IMG_SIZE) / 2;

			this._createArrow('left-arrow', scrollbarDelta, arrowDelta, null, null, options.arrowSize, options.horizontalScrollbarSize, () => this._createMouseWheelEvent(1));
			this._createArrow('right-arrow', scrollbarDelta, null, null, arrowDelta, options.arrowSize, options.horizontalScrollbarSize, () => this._createMouseWheelEvent(-1));
		}

		this._createSlider(Math.floor((options.horizontalScrollbarSize - options.horizontalSliderSize) / 2), 0, null, options.horizontalSliderSize);
	}

	protected _createMouseWheelEvent(sign: number) {
		return new StandardMouseWheelEvent(null, sign, 0);
	}

	protected _updateSlider(sliderSize: number, sliderPosition: number): void {
		StyleMutator.setWidth(this.slider, sliderSize);
		if (!this._forbidTranslate3dUse && Browser.canUseTranslate3d) {
			StyleMutator.setTransform(this.slider, 'translate3d(' + sliderPosition + 'px, 0px, 0px)');
		} else {
			StyleMutator.setLeft(this.slider, sliderPosition);
		}
	}

	protected _renderDomNode(largeSize: number, smallSize: number): void {
		StyleMutator.setWidth(this.domNode, largeSize);
		StyleMutator.setHeight(this.domNode, smallSize);
		StyleMutator.setLeft(this.domNode, 0);
		StyleMutator.setBottom(this.domNode, 0);
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
