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

export class VerticalScrollbar extends AbstractScrollbar.AbstractScrollbar {

	private scrollable:IScrollable;

	constructor(scrollable:IScrollable, parent:Common.IParent, options:Common.IOptions) {
		var s = new AbstractScrollbar.ScrollbarState(
			(options.verticalHasArrows ? options.arrowSize : 0),
			(options.vertical === Common.Visibility.Hidden ? 0 : options.verticalScrollbarSize),
			(options.horizontal === Common.Visibility.Hidden ? 0 : options.horizontalScrollbarSize)
		);
		super(options.forbidTranslate3dUse, parent, s, options.vertical, 'vertical');
		this.scrollable = scrollable;

		this._createDomNode();
		if (options.verticalHasArrows) {
			var arrowDelta = (options.arrowSize - AbstractScrollbar.AbstractScrollbar.ARROW_IMG_SIZE) / 2;
			var scrollbarDelta = (options.verticalScrollbarSize - AbstractScrollbar.AbstractScrollbar.ARROW_IMG_SIZE) / 2;

			this._createArrow('up-arrow', arrowDelta, scrollbarDelta, null, null, options.verticalScrollbarSize, options.arrowSize, () => this._createMouseWheelEvent(1));
			this._createArrow('down-arrow', null, scrollbarDelta, arrowDelta, null, options.verticalScrollbarSize, options.arrowSize, () => this._createMouseWheelEvent(-1));
		}

		this._createSlider(0, Math.floor((options.verticalScrollbarSize - options.verticalSliderSize) / 2), options.verticalSliderSize, null);
	}

	public _createMouseWheelEvent(sign:number) {
		return new Mouse.StandardMouseWheelEvent(null, 0, sign);
	}

	public _updateSlider(sliderSize:number, sliderPosition:number): void {
		DomUtils.StyleMutator.setHeight(this.slider, sliderSize);
		if (!this.forbidTranslate3dUse && Browser.canUseTranslate3d) {
			DomUtils.StyleMutator.setTransform(this.slider, 'translate3d(0px, ' + sliderPosition + 'px, 0px)');
		} else {
			DomUtils.StyleMutator.setTop(this.slider, sliderPosition);
		}
	}

	public _renderDomNode(largeSize:number, smallSize:number): void {
		DomUtils.StyleMutator.setWidth(this.domNode, smallSize);
		DomUtils.StyleMutator.setHeight(this.domNode, largeSize);
		DomUtils.StyleMutator.setRight(this.domNode, 0);
		DomUtils.StyleMutator.setTop(this.domNode, 0);
	}

	public _mouseDownRelativePosition(e:Mouse.StandardMouseEvent, domNodePosition:DomUtils.IDomNodePosition): number {
		return e.posy - domNodePosition.top;
	}

	public _sliderMousePosition(e:AbstractScrollbar.IMouseMoveEventData): number {
		return e.posy;
	}

	public _sliderOrthogonalMousePosition(e:AbstractScrollbar.IMouseMoveEventData): number {
		return e.posx;
	}

	public _getScrollPosition(): number {
		return this.scrollable.getScrollTop();
	}

	public _setScrollPosition(scrollPosition:number): void {
		this.scrollable.setScrollTop(scrollPosition);
	}
}
