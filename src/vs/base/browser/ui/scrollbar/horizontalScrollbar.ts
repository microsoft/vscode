/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {AbstractScrollbar, ScrollbarState, IMouseMoveEventData} from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import {StandardMouseEvent, StandardMouseWheelEvent} from 'vs/base/browser/mouseEvent';
import DomUtils = require('vs/base/browser/dom');
import {IParent, IOptions, Visibility} from 'vs/base/browser/ui/scrollbar/common';
import Browser = require('vs/base/browser/browser');
import {IScrollable} from 'vs/base/common/scrollable';

export class HorizontalScrollbar extends AbstractScrollbar {

	private scrollable: IScrollable;

	constructor(scrollable: IScrollable, parent: IParent, options: IOptions) {
		let s = new ScrollbarState(
			(options.horizontalHasArrows ? options.arrowSize : 0),
			(options.horizontal === Visibility.Hidden ? 0 : options.horizontalScrollbarSize),
			(options.vertical === Visibility.Hidden ? 0 : options.verticalScrollbarSize)
		);
		super(options.forbidTranslate3dUse, parent, s, options.horizontal, 'horizontal');
		this.scrollable = scrollable;

		this._createDomNode();
		if (options.horizontalHasArrows) {
			let arrowDelta = (options.arrowSize - AbstractScrollbar.ARROW_IMG_SIZE) / 2;
			let scrollbarDelta = (options.horizontalScrollbarSize - AbstractScrollbar.ARROW_IMG_SIZE) / 2;

			this._createArrow('left-arrow', scrollbarDelta, arrowDelta, null, null, options.arrowSize, options.horizontalScrollbarSize, () => this._createMouseWheelEvent(1));
			this._createArrow('right-arrow', scrollbarDelta, null, null, arrowDelta, options.arrowSize, options.horizontalScrollbarSize, () => this._createMouseWheelEvent(-1));
		}

		this._createSlider(Math.floor((options.horizontalScrollbarSize - options.horizontalSliderSize) / 2), 0, null, options.horizontalSliderSize);
	}

	public _createMouseWheelEvent(sign: number) {
		return new StandardMouseWheelEvent(null, sign, 0);
	}

	public _updateSlider(sliderSize: number, sliderPosition: number): void {
		DomUtils.StyleMutator.setWidth(this.slider, sliderSize);
		if (!this.forbidTranslate3dUse && Browser.canUseTranslate3d) {
			DomUtils.StyleMutator.setTransform(this.slider, 'translate3d(' + sliderPosition + 'px, 0px, 0px)');
		} else {
			DomUtils.StyleMutator.setLeft(this.slider, sliderPosition);
		}
	}

	public _renderDomNode(largeSize: number, smallSize: number): void {
		DomUtils.StyleMutator.setWidth(this.domNode, largeSize);
		DomUtils.StyleMutator.setHeight(this.domNode, smallSize);
		DomUtils.StyleMutator.setLeft(this.domNode, 0);
		DomUtils.StyleMutator.setBottom(this.domNode, 0);
	}

	public _mouseDownRelativePosition(e: StandardMouseEvent, domNodePosition: DomUtils.IDomNodePosition): number {
		return e.posx - domNodePosition.left;
	}

	public _sliderMousePosition(e: IMouseMoveEventData): number {
		return e.posx;
	}

	public _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number {
		return e.posy;
	}

	public _getScrollPosition(): number {
		return this.scrollable.getScrollLeft();
	}

	public _setScrollPosition(scrollPosition: number) {
		this.scrollable.setScrollLeft(scrollPosition);
	}
}
