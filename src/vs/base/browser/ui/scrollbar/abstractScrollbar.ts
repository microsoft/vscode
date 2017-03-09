/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Platform from 'vs/base/common/platform';
import * as DomUtils from 'vs/base/browser/dom';
import { IMouseEvent, StandardMouseEvent, StandardMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import { Widget } from 'vs/base/browser/ui/widget';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ScrollbarState } from 'vs/base/browser/ui/scrollbar/scrollbarState';
import { ScrollbarArrow, ScrollbarArrowOptions } from 'vs/base/browser/ui/scrollbar/scrollbarArrow';
import { ScrollbarVisibilityController } from 'vs/base/browser/ui/scrollbar/scrollbarVisibilityController';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';

/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const MOUSE_DRAG_RESET_DISTANCE = 140;

export interface IMouseMoveEventData {
	leftButton: boolean;
	posx: number;
	posy: number;
}

export interface ScrollbarHost {
	onMouseWheel(mouseWheelEvent: StandardMouseWheelEvent): void;
	onDragStart(): void;
	onDragEnd(): void;
}

export interface AbstractScrollbarOptions {
	canUseTranslate3d: boolean;
	lazyRender: boolean;
	host: ScrollbarHost;
	scrollbarState: ScrollbarState;
	visibility: ScrollbarVisibility;
	extraScrollbarClassName: string;
	scrollable: Scrollable;
}

export abstract class AbstractScrollbar extends Widget {

	protected _canUseTranslate3d: boolean;
	protected _host: ScrollbarHost;
	protected _scrollable: Scrollable;
	private _lazyRender: boolean;
	protected _scrollbarState: ScrollbarState;
	private _visibilityController: ScrollbarVisibilityController;
	private _mouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	public domNode: FastDomNode<HTMLElement>;
	public slider: FastDomNode<HTMLElement>;

	protected _shouldRender: boolean;

	constructor(opts: AbstractScrollbarOptions) {
		super();
		this._canUseTranslate3d = opts.canUseTranslate3d;
		this._lazyRender = opts.lazyRender;
		this._host = opts.host;
		this._scrollable = opts.scrollable;
		this._scrollbarState = opts.scrollbarState;
		this._visibilityController = this._register(new ScrollbarVisibilityController(opts.visibility, 'visible scrollbar ' + opts.extraScrollbarClassName, 'invisible scrollbar ' + opts.extraScrollbarClassName));
		this._mouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
		this._shouldRender = true;
		this.domNode = createFastDomNode(document.createElement('div'));

		this._visibilityController.setDomNode(this.domNode);
		this.domNode.setPosition('absolute');

		this.onmousedown(this.domNode.domNode, (e) => this._domNodeMouseDown(e));
	}

	// ----------------- creation

	/**
	 * Creates the dom node for an arrow & adds it to the container
	 */
	protected _createArrow(opts: ScrollbarArrowOptions): void {
		let arrow = this._register(new ScrollbarArrow(opts));
		this.domNode.domNode.appendChild(arrow.bgDomNode);
		this.domNode.domNode.appendChild(arrow.domNode);
	}

	/**
	 * Creates the slider dom node, adds it to the container & hooks up the events
	 */
	protected _createSlider(top: number, left: number, width: number, height: number): void {
		this.slider = createFastDomNode(document.createElement('div'));
		this.slider.setClassName('slider');
		this.slider.setPosition('absolute');
		this.slider.setTop(top);
		this.slider.setLeft(left);
		this.slider.setWidth(width);
		this.slider.setHeight(height);

		this.domNode.domNode.appendChild(this.slider.domNode);

		this.onmousedown(this.slider.domNode, (e) => this._sliderMouseDown(e));
	}

	// ----------------- Update state

	public setCanUseTranslate3d(canUseTranslate3d: boolean): boolean {
		this._canUseTranslate3d = canUseTranslate3d;
		return true;
	}

	protected _onElementSize(visibleSize: number): boolean {
		if (this._scrollbarState.setVisibleSize(visibleSize)) {
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
			this._shouldRender = true;
			if (!this._lazyRender) {
				this.render();
			}
		}
		return this._shouldRender;
	}

	protected _onElementScrollSize(elementScrollSize: number): boolean {
		if (this._scrollbarState.setScrollSize(elementScrollSize)) {
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
			this._shouldRender = true;
			if (!this._lazyRender) {
				this.render();
			}
		}
		return this._shouldRender;
	}

	protected _onElementScrollPosition(elementScrollPosition: number): boolean {
		if (this._scrollbarState.setScrollPosition(elementScrollPosition)) {
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
			this._shouldRender = true;
			if (!this._lazyRender) {
				this.render();
			}
		}
		return this._shouldRender;
	}

	// ----------------- rendering

	public beginReveal(): void {
		this._visibilityController.setShouldBeVisible(true);
	}

	public beginHide(): void {
		this._visibilityController.setShouldBeVisible(false);
	}

	public render(): void {
		if (!this._shouldRender) {
			return;
		}
		this._shouldRender = false;

		if (this._canUseTranslate3d) {
			// Put the scrollbar in its own layer
			this.domNode.setTransform('translate3d(0px, 0px, 0px)');
		} else {
			this.domNode.setTransform('');
		}

		this._renderDomNode(this._scrollbarState.getRectangleLargeSize(), this._scrollbarState.getRectangleSmallSize());
		this._updateSlider(this._scrollbarState.getSliderSize(), this._scrollbarState.getArrowSize() + this._scrollbarState.getSliderPosition());
	}
	// ----------------- DOM events

	private _domNodeMouseDown(e: IMouseEvent): void {
		if (e.target !== this.domNode.domNode) {
			return;
		}
		this._onMouseDown(e);
	}

	public delegateMouseDown(browserEvent: MouseEvent): void {
		let e = new StandardMouseEvent(browserEvent);
		let domTop = this.domNode.domNode.getClientRects()[0].top;
		let sliderStart = domTop + this._scrollbarState.getSliderPosition();
		let sliderStop = domTop + this._scrollbarState.getSliderPosition() + this._scrollbarState.getSliderSize();
		let mousePos = this._sliderMousePosition(e);
		if (sliderStart <= mousePos && mousePos <= sliderStop) {
			// Act as if it was a mouse down on the slider
			this._sliderMouseDown(e);
		} else {
			// Act as if it was a mouse down on the scrollbar
			this._onMouseDown(e);
		}
	}

	private _onMouseDown(e: IMouseEvent): void {
		let domNodePosition = DomUtils.getDomNodePagePosition(this.domNode.domNode);
		let desiredSliderPosition = this._mouseDownRelativePosition(e, domNodePosition) - this._scrollbarState.getArrowSize() - this._scrollbarState.getSliderSize() / 2;
		this.setDesiredScrollPosition(this._scrollbarState.convertSliderPositionToScrollPosition(desiredSliderPosition));
		this._sliderMouseDown(e);
	}

	private _sliderMouseDown(e: IMouseEvent): void {
		if (e.leftButton) {
			let initialMouseOrthogonalPosition = this._sliderOrthogonalMousePosition(e);
			let initialScrollPosition = this._getScrollPosition();
			let draggingDelta = this._sliderMousePosition(e) - this._scrollbarState.getSliderPosition();
			this.slider.toggleClassName('active', true);

			this._mouseMoveMonitor.startMonitoring(
				standardMouseMoveMerger,
				(mouseMoveData: IStandardMouseMoveEventData) => {
					let mouseOrthogonalPosition = this._sliderOrthogonalMousePosition(mouseMoveData);
					let mouseOrthogonalDelta = Math.abs(mouseOrthogonalPosition - initialMouseOrthogonalPosition);
					// console.log(initialMouseOrthogonalPosition + ' -> ' + mouseOrthogonalPosition + ': ' + mouseOrthogonalDelta);
					if (Platform.isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
						// The mouse has wondered away from the scrollbar => reset dragging
						this.setDesiredScrollPosition(initialScrollPosition);
					} else {
						let desiredSliderPosition = this._sliderMousePosition(mouseMoveData) - draggingDelta;
						this.setDesiredScrollPosition(this._scrollbarState.convertSliderPositionToScrollPosition(desiredSliderPosition));
					}
				},
				() => {
					this.slider.toggleClassName('active', false);
					this._host.onDragEnd();
				}
			);

			e.preventDefault();
			this._host.onDragStart();
		}
	}

	public validateScrollPosition(desiredScrollPosition: number): number {
		return this._scrollbarState.validateScrollPosition(desiredScrollPosition);
	}

	public setDesiredScrollPosition(desiredScrollPosition: number): boolean {
		desiredScrollPosition = this.validateScrollPosition(desiredScrollPosition);

		let oldScrollPosition = this._getScrollPosition();
		this._setScrollPosition(desiredScrollPosition);
		let newScrollPosition = this._getScrollPosition();

		if (oldScrollPosition !== newScrollPosition) {
			this._onElementScrollPosition(this._getScrollPosition());
			return true;
		}
		return false;
	}

	// ----------------- Overwrite these

	protected abstract _renderDomNode(largeSize: number, smallSize: number): void;
	protected abstract _updateSlider(sliderSize: number, sliderPosition: number): void;
	protected abstract _mouseDownRelativePosition(e: IMouseEvent, domNodePosition: DomUtils.IDomNodePagePosition): number;
	protected abstract _sliderMousePosition(e: IMouseMoveEventData): number;
	protected abstract _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number;
	protected abstract _getScrollPosition(): number;
	protected abstract _setScrollPosition(elementScrollPosition: number): void;
}
