/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Browser from 'vs/base/browser/browser';
import * as Platform from 'vs/base/common/platform';
import * as DomUtils from 'vs/base/browser/dom';
import {IMouseEvent, StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {IParent, Visibility} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {Disposable} from 'vs/base/common/lifecycle';
import {GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger} from 'vs/base/browser/globalMouseMoveMonitor';
import {Widget} from 'vs/base/browser/ui/widget';
import {TimeoutTimer} from 'vs/base/common/async';
import {FastDomNode, createFastDomNode} from 'vs/base/browser/styleMutator';
import {ScrollbarState} from 'vs/base/browser/ui/scrollbar/scrollbarState';
import {ScrollbarArrow, IMouseWheelEventFactory} from 'vs/base/browser/ui/scrollbar/scrollbarArrow';

/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const MOUSE_DRAG_RESET_DISTANCE = 140;

class VisibilityController extends Disposable {
	private _visibility: Visibility;
	private _visibleClassName: string;
	private _invisibleClassName: string;
	private _domNode: FastDomNode;
	private _shouldBeVisible: boolean;
	private _isNeeded: boolean;
	private _isVisible: boolean;
	private _revealTimer: TimeoutTimer;

	constructor(visibility: Visibility, visibleClassName: string, invisibleClassName: string) {
		super();
		this._visibility = visibility;
		this._visibleClassName = visibleClassName;
		this._invisibleClassName = invisibleClassName;
		this._domNode = null;
		this._isVisible = false;
		this._isNeeded = false;
		this._shouldBeVisible = false;
		this._revealTimer = this._register(new TimeoutTimer());
	}

	// ----------------- Hide / Reveal

	private applyVisibilitySetting(shouldBeVisible: boolean): boolean {
		if (this._visibility === Visibility.Hidden) {
			return false;
		}
		if (this._visibility === Visibility.Visible) {
			return true;
		}
		return shouldBeVisible;
	}

	public setShouldBeVisible(rawShouldBeVisible: boolean): void {
		let shouldBeVisible = this.applyVisibilitySetting(rawShouldBeVisible);

		if (this._shouldBeVisible !== shouldBeVisible) {
			this._shouldBeVisible = shouldBeVisible;
			this.ensureVisibility();
		}
	}

	public setIsNeeded(isNeeded: boolean): void {
		if (this._isNeeded !== isNeeded) {
			this._isNeeded = isNeeded;
			this.ensureVisibility();
		}
	}

	public setDomNode(domNode: FastDomNode): void {
		this._domNode = domNode;
		this._domNode.setClassName(this._invisibleClassName);

		// Now that the flags & the dom node are in a consistent state, ensure the Hidden/Visible configuration
		this.setShouldBeVisible(false);
	}

	public ensureVisibility(): void {

		if (!this._isNeeded) {
			// Nothing to be rendered
			this._hide(false);
			return;
		}

		if (this._shouldBeVisible) {
			this._reveal();
		} else {
			this._hide(true);
		}
	}


	private _reveal(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;

		// The CSS animation doesn't play otherwise
		this._revealTimer.setIfNotSet(() => {
			this._domNode.setClassName(this._visibleClassName);
		}, 0);
	}

	private _hide(withFadeAway: boolean): void {
		this._revealTimer.cancel();
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode.setClassName(this._invisibleClassName + (withFadeAway ? ' fade' : ''));
	}
}

export interface IMouseMoveEventData {
	leftButton: boolean;
	posx: number;
	posy: number;
}

export abstract class AbstractScrollbar extends Widget {

	protected _forbidTranslate3dUse: boolean;
	private _lazyRender: boolean;
	private _parent: IParent;
	private _scrollbarState: ScrollbarState;
	private _visibilityController: VisibilityController;
	private _mouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	public domNode: FastDomNode;
	public slider: FastDomNode;

	protected _shouldRender: boolean;

	constructor(forbidTranslate3dUse: boolean, lazyRender:boolean, parent: IParent, scrollbarState: ScrollbarState, visibility: Visibility, extraScrollbarClassName: string) {
		super();
		this._forbidTranslate3dUse = forbidTranslate3dUse;
		this._lazyRender = lazyRender;
		this._parent = parent;
		this._scrollbarState = scrollbarState;
		this._visibilityController = this._register(new VisibilityController(visibility, 'visible scrollbar ' + extraScrollbarClassName, 'invisible scrollbar ' + extraScrollbarClassName));
		this._mouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
		this._shouldRender = true;
	}

	// ----------------- initialize & clean-up

	/**
	 * Creates the container dom node for the scrollbar & hooks up the events
	 */
	protected _createDomNode(): void {
		this.domNode = createFastDomNode(document.createElement('div'));
		if (!this._forbidTranslate3dUse && Browser.canUseTranslate3d) {
			// Put the scrollbar in its own layer
			this.domNode.setTransform('translate3d(0px, 0px, 0px)');
		}

		this._visibilityController.setDomNode(this.domNode);
		this.domNode.setPosition('absolute');

		this.onmousedown(this.domNode.domNode, (e) => this._domNodeMouseDown(e));
	}

	/**
	 * Creates the dom node for an arrow & adds it to the container
	 */
	protected _createArrow(className: string, top: number, left: number, bottom: number, right: number, bgWidth: number, bgHeight: number, mouseWheelEventFactory: IMouseWheelEventFactory): void {
		let arrow = this._register(new ScrollbarArrow(className, top, left, bottom, right, bgWidth, bgHeight, mouseWheelEventFactory, this._parent));
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

	public onElementSize(visibleSize: number): boolean {
		if (this._scrollbarState.setVisibleSize(visibleSize)) {
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
			this._shouldRender = true;
			if (!this._lazyRender) {
				this.render();
			}
		}
		return this._shouldRender;
	}

	public onElementScrollSize(elementScrollSize: number): boolean {
		if (this._scrollbarState.setScrollSize(elementScrollSize)) {
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
			this._shouldRender = true;
			if (!this._lazyRender) {
				this.render();
			}
		}
		return this._shouldRender;
	}

	public onElementScrollPosition(elementScrollPosition: number): boolean {
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
		let domNodePosition = DomUtils.getDomNodePosition(this.domNode.domNode);
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
					this._parent.onDragEnd();
				}
			);

			e.preventDefault();
			this._parent.onDragStart();
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
			this.onElementScrollPosition(this._getScrollPosition());
			return true;
		}
		return false;
	}

	// ----------------- Overwrite these

	protected abstract _renderDomNode(largeSize: number, smallSize: number): void;
	protected abstract _updateSlider(sliderSize: number, sliderPosition: number): void;
	protected abstract _mouseDownRelativePosition(e: IMouseEvent, domNodePosition: DomUtils.IDomNodePosition): number;
	protected abstract _sliderMousePosition(e: IMouseMoveEventData): number;
	protected abstract _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number;
	protected abstract _getScrollPosition(): number;
	protected abstract _setScrollPosition(elementScrollPosition: number): void;
}
