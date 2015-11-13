/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import AbstractScrollbar = require('vs/base/browser/ui/scrollbar/impl/abstractScrollbar');
import Mouse = require('vs/base/browser/mouseEvent');
import DomUtils = require('vs/base/browser/dom');
import Common = require('vs/base/browser/ui/scrollbar/impl/common');
import ScrollableElement = require('vs/base/browser/ui/scrollbar/scrollableElement');
import Browser = require('vs/base/browser/browser');
import {IScrollable} from 'vs/base/common/scrollable';

export class HorizontalScrollbar extends AbstractScrollbar.AbstractScrollbar {

	private scrollable:IScrollable;

	constructor(scrollable:IScrollable, parent:Common.IParent, options:Common.IOptions) {
		var s = new AbstractScrollbar.ScrollbarState(
			(options.horizontalHasArrows ? options.arrowSize : 0),
			(options.horizontal === Common.Visibility.Hidden ? 0 : options.horizontalScrollbarSize),
			(options.vertical === Common.Visibility.Hidden ? 0 : options.verticalScrollbarSize)
		);
		super(options.forbidTranslate3dUse, parent, s, options.horizontal, 'horizontal');
		this.scrollable = scrollable;

		this._createDomNode();
		if (options.horizontalHasArrows) {
			var arrowDelta = (options.arrowSize - AbstractScrollbar.AbstractScrollbar.ARROW_IMG_SIZE) / 2;
			var scrollbarDelta = (options.horizontalScrollbarSize - AbstractScrollbar.AbstractScrollbar.ARROW_IMG_SIZE) / 2;

			this._createArrow('left-arrow', scrollbarDelta, arrowDelta, null, null, options.arrowSize, options.horizontalScrollbarSize, () => this._createMouseWheelEvent(1));
			this._createArrow('right-arrow', scrollbarDelta, null, null, arrowDelta, options.arrowSize, options.horizontalScrollbarSize, () => this._createMouseWheelEvent(-1));
		}

		this._createSlider(Math.floor((options.horizontalScrollbarSize - options.horizontalSliderSize) / 2), 0, null, options.horizontalSliderSize);
	}

	public _createMouseWheelEvent(sign:number) {
		return new Mouse.StandardMouseWheelEvent(null, sign, 0);
	}

	public _updateSlider(sliderSize:number, sliderPosition:number): void {
		DomUtils.StyleMutator.setWidth(this.slider, sliderSize);
		if (!this.forbidTranslate3dUse && Browser.canUseTranslate3d) {
			DomUtils.StyleMutator.setTransform(this.slider, 'translate3d(' + sliderPosition + 'px, 0px, 0px)');
		} else {
			DomUtils.StyleMutator.setLeft(this.slider, sliderPosition);
		}
	}

	public _renderDomNode(largeSize:number, smallSize:number): void {
		DomUtils.StyleMutator.setWidth(this.domNode, largeSize);
		DomUtils.StyleMutator.setHeight(this.domNode, smallSize);
		DomUtils.StyleMutator.setLeft(this.domNode, 0);
		DomUtils.StyleMutator.setBottom(this.domNode, 0);
	}

	public _mouseDownRelativePosition(e:Mouse.StandardMouseEvent, domNodePosition:DomUtils.IDomNodePosition): number {
		return e.posx - domNodePosition.left;
	}

	public _sliderMousePosition(e:AbstractScrollbar.IMouseMoveEventData): number {
		return e.posx;
	}

	public _sliderOrthogonalMousePosition(e:AbstractScrollbar.IMouseMoveEventData): number {
		return e.posy;
	}

	public _getScrollPosition(): number {
		return this.scrollable.getScrollLeft();
	}

	public _setScrollPosition(scrollPosition:number) {
		this.scrollable.setScrollLeft(scrollPosition);
	}
}
