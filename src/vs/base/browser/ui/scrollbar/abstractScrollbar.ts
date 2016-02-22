/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Browser from 'vs/base/browser/browser';
import * as Platform from 'vs/base/common/platform';
import * as DomUtils from 'vs/base/browser/dom';
import {IMouseEvent, StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {IMouseWheelEvent, IParent, Visibility, IScrollbar} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {Disposable} from 'vs/base/common/lifecycle';
import {GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger} from 'vs/base/browser/globalMouseMoveMonitor';
import {Widget} from 'vs/base/browser/ui/widget';
import {TimeoutTimer, IntervalTimer} from 'vs/base/common/async';

/**
 * The arrow image size.
 */
export const ARROW_IMG_SIZE = 11;

/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const MOUSE_DRAG_RESET_DISTANCE = 140;

/**
 * The minimal size of the slider (such that it can still be clickable) -- it is artificially enlarged.
 */
const MINIMUM_SLIDER_SIZE = 20;


export interface IMouseWheelEventFactory {
	(): IMouseWheelEvent;
}

export class ScrollbarState {

	// --- immutable
	private _scrollbarSize: number;
	private _oppositeScrollbarSize: number;
	private _arrowSize: number;

	// --- variables
	private _visibleSize: number;
	private _scrollSize: number;
	private _scrollPosition: number;

	// --- computed variables

	/**
	 * `visibleSize` - `oppositeScrollbarSize`
	 */
	private _computedAvailableSize: number;

	/**
	 * `computedAvailableSize` - 2 * `arrowSize`
	 */
	private _computedRepresentableSize: number;

	/**
	 * `computedRepresentableSize` / `scrollSize`
	 */
	private _computedRatio: number;

	/**
	 * (`scrollSize` > `visibleSize`)
	 */
	private _computedIsNeeded: boolean;

	private _computedSliderSize: number;
	private _computedSliderPosition: number;

	constructor(arrowSize: number, scrollbarSize: number, oppositeScrollbarSize: number) {
		this._visibleSize = 0;
		this._scrollSize = 0;
		this._scrollPosition = 0;
		this._scrollbarSize = scrollbarSize;
		this._oppositeScrollbarSize = oppositeScrollbarSize;
		this._arrowSize = arrowSize;
		this._refreshComputedValues();
	}

	public setVisibleSize(visibleSize: number): boolean {
		if (this._visibleSize !== visibleSize) {
			this._visibleSize = visibleSize;
			this._refreshComputedValues();
			return true;
		}
		return false;
	}

	public setScrollSize(scrollSize: number): boolean {
		if (this._scrollSize !== scrollSize) {
			this._scrollSize = scrollSize;
			this._refreshComputedValues();
			return true;
		}
		return false;
	}

	public setScrollPosition(scrollPosition: number): boolean {
		if (this._scrollPosition !== scrollPosition) {
			this._scrollPosition = scrollPosition;
			this._refreshComputedValues();
			return true;
		}
		return false;
	}

	private _refreshComputedValues(): void {
		this._computedAvailableSize = Math.max(0, this._visibleSize - this._oppositeScrollbarSize);
		this._computedRepresentableSize = Math.max(0, this._computedAvailableSize - 2 * this._arrowSize);
		this._computedRatio = this._scrollSize > 0 ? (this._computedRepresentableSize / this._scrollSize) : 0;
		this._computedIsNeeded = (this._scrollSize > this._visibleSize);

		if (!this._computedIsNeeded) {
			this._computedSliderSize = this._computedRepresentableSize;
			this._computedSliderPosition = 0;
		} else {
			this._computedSliderSize = Math.floor(this._visibleSize * this._computedRatio);
			this._computedSliderPosition = Math.floor(this._scrollPosition * this._computedRatio);

			if (this._computedSliderSize < MINIMUM_SLIDER_SIZE) {
				// We must artificially increase the size of the slider, since the slider would be too small otherwise
				// The effort is to keep the slider centered around the original position, but we must take into
				// account the cases when the slider is too close to the top or too close to the bottom

				let sliderArtificialOffset = (MINIMUM_SLIDER_SIZE - this._computedSliderSize) / 2;
				this._computedSliderSize = MINIMUM_SLIDER_SIZE;

				this._computedSliderPosition -= sliderArtificialOffset;

				if (this._computedSliderPosition + this._computedSliderSize > this._computedRepresentableSize) {
					// Slider is too close to the bottom, so we glue it to the bottom
					this._computedSliderPosition = this._computedRepresentableSize - this._computedSliderSize;
				}

				if (this._computedSliderPosition < 0) {
					// Slider is too close to the top, so we glue it to the top
					this._computedSliderPosition = 0;
				}
			}
		}
	}

	public getArrowSize(): number {
		return this._arrowSize;
	}

	public getRectangleLargeSize(): number {
		return this._computedAvailableSize;
	}

	public getRectangleSmallSize(): number {
		return this._scrollbarSize;
	}

	public isNeeded(): boolean {
		return this._computedIsNeeded;
	}

	public getSliderSize(): number {
		return this._computedSliderSize;
	}

	public getSliderPosition(): number {
		return this._computedSliderPosition;
	}

	public convertSliderPositionToScrollPosition(desiredSliderPosition: number): number {
		return desiredSliderPosition / this._computedRatio;
	}

	public validateScrollPosition(desiredScrollPosition: number): number {
		desiredScrollPosition = Math.round(desiredScrollPosition);
		desiredScrollPosition = Math.max(desiredScrollPosition, 0);
		desiredScrollPosition = Math.min(desiredScrollPosition, this._scrollSize - this._visibleSize);
		return desiredScrollPosition;
	}
}

class ScrollbarArrow extends Widget {
	private _parent: IParent;
	private _mouseWheelEventFactory: IMouseWheelEventFactory;
	public bgDomNode: HTMLElement;
	public domNode: HTMLElement;
	private _mousedownRepeatTimer: IntervalTimer;
	private _mousedownScheduleRepeatTimer: TimeoutTimer;
	private _mouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	constructor(className: string, top: number, left: number, bottom: number, right: number, bgWidth: number, bgHeight: number, mouseWheelEventFactory: IMouseWheelEventFactory, parent: IParent) {
		super();
		this._parent = parent;
		this._mouseWheelEventFactory = mouseWheelEventFactory;

		this.bgDomNode = document.createElement('div');
		this.bgDomNode.className = 'arrow-background';
		this.bgDomNode.style.position = 'absolute';
		setSize(this.bgDomNode, bgWidth, bgHeight);
		setPosition(this.bgDomNode, (top !== null ? 0 : null), (left !== null ? 0 : null), (bottom !== null ? 0 : null), (right !== null ? 0 : null));


		this.domNode = document.createElement('div');
		this.domNode.className = className;
		this.domNode.style.position = 'absolute';
		setSize(this.domNode, ARROW_IMG_SIZE, ARROW_IMG_SIZE);
		setPosition(this.domNode, top, left, bottom, right);

		this._mouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
		this.onmousedown(this.bgDomNode, (e) => this._arrowMouseDown(e));
		this.onmousedown(this.domNode, (e) => this._arrowMouseDown(e));

		this._mousedownRepeatTimer = this._register(new IntervalTimer());
		this._mousedownScheduleRepeatTimer = this._register(new TimeoutTimer());
	}

	private _arrowMouseDown(e: IMouseEvent): void {
		let repeater = () => {
			this._parent.onMouseWheel(this._mouseWheelEventFactory());
		};

		let scheduleRepeater = () => {
			this._mousedownRepeatTimer.cancelAndSet(repeater, 1000 / 24);
		};

		repeater();
		this._mousedownRepeatTimer.cancel();
		this._mousedownScheduleRepeatTimer.cancelAndSet(scheduleRepeater, 200);

		this._mouseMoveMonitor.startMonitoring(
			standardMouseMoveMerger,
			(mouseMoveData: IStandardMouseMoveEventData) => {
				/* Intentional empty */
			},
			() => {
				this._mousedownRepeatTimer.cancel();
				this._mousedownScheduleRepeatTimer.cancel();
			}
		);

		e.preventDefault();
	}
}

class VisibilityController extends Disposable {
	private _visibility: Visibility;
	private _visibleClassName: string;
	private _invisibleClassName: string;
	private _domNode: HTMLElement;
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

	public setDomNode(domNode: HTMLElement): void {
		this._domNode = domNode;
		this._domNode.className = this._invisibleClassName;

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
			this._domNode.className = this._visibleClassName;
		}, 0);
	}

	private _hide(withFadeAway: boolean): void {
		this._revealTimer.cancel();
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode.className = this._invisibleClassName + (withFadeAway ? ' fade' : '');
	}
}

export interface IMouseMoveEventData {
	leftButton: boolean;
	posx: number;
	posy: number;
}

export abstract class AbstractScrollbar extends Widget implements IScrollbar {

	protected _forbidTranslate3dUse: boolean;
	private _parent: IParent;
	private _scrollbarState: ScrollbarState;
	private _visibilityController: VisibilityController;
	private _mouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	public domNode: HTMLElement;
	public slider: HTMLElement;

	constructor(forbidTranslate3dUse: boolean, parent: IParent, scrollbarState: ScrollbarState, visibility: Visibility, extraScrollbarClassName: string) {
		super();
		this._forbidTranslate3dUse = forbidTranslate3dUse;
		this._parent = parent;
		this._scrollbarState = scrollbarState;
		this._visibilityController = this._register(new VisibilityController(visibility, 'visible scrollbar ' + extraScrollbarClassName, 'invisible scrollbar ' + extraScrollbarClassName));
		this._mouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
	}

	// ----------------- initialize & clean-up

	/**
	 * Creates the container dom node for the scrollbar & hooks up the events
	 */
	protected _createDomNode(): void {
		this.domNode = document.createElement('div');
		if (!this._forbidTranslate3dUse && Browser.canUseTranslate3d) {
			// Put the worker reporter in its own layer
			this.domNode.style.transform = 'translate3d(0px, 0px, 0px)';
		}

		this._visibilityController.setDomNode(this.domNode);
		this.domNode.style.position = 'absolute';

		this.onmousedown(this.domNode, (e) => this._domNodeMouseDown(e));
	}

	/**
	 * Creates the dom node for an arrow & adds it to the container
	 */
	protected _createArrow(className: string, top: number, left: number, bottom: number, right: number, bgWidth: number, bgHeight: number, mouseWheelEventFactory: IMouseWheelEventFactory): void {
		let arrow = this._register(new ScrollbarArrow(className, top, left, bottom, right, bgWidth, bgHeight, mouseWheelEventFactory, this._parent));
		this.domNode.appendChild(arrow.bgDomNode);
		this.domNode.appendChild(arrow.domNode);
	}

	/**
	 * Creates the slider dom node, adds it to the container & hooks up the events
	 */
	protected _createSlider(top: number, left: number, width: number, height: number): void {
		this.slider = document.createElement('div');
		this.slider.className = 'slider';
		this.slider.style.position = 'absolute';
		setPosition(this.slider, top, left, null, null);
		setSize(this.slider, width, height);
		this.domNode.appendChild(this.slider);

		this.onmousedown(this.slider, (e) => this._sliderMouseDown(e));
	}

	// ----------------- Update state

	public onElementSize(visibleSize: number) {
		if (this._scrollbarState.setVisibleSize(visibleSize)) {
			this._renderDomNode(this._scrollbarState.getRectangleLargeSize(), this._scrollbarState.getRectangleSmallSize());
			this._renderSlider();
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
		}
	}

	public onElementScrollSize(elementScrollSize: number): void {
		if (this._scrollbarState.setScrollSize(elementScrollSize)) {
			this._renderSlider();
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
		}
	}

	public onElementScrollPosition(elementScrollPosition: number): void {
		if (this._scrollbarState.setScrollPosition(elementScrollPosition)) {
			this._renderSlider();
			this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
		}
	}

	// ----------------- rendering

	public beginReveal(): void {
		this._visibilityController.setShouldBeVisible(true);
	}

	public beginHide(): void {
		this._visibilityController.setShouldBeVisible(false);
	}

	private _renderSlider(): void {
		this._updateSlider(this._scrollbarState.getSliderSize(), this._scrollbarState.getArrowSize() + this._scrollbarState.getSliderPosition());
	}

	// ----------------- DOM events

	private _domNodeMouseDown(e: IMouseEvent): void {
		if (e.target !== this.domNode) {
			return;
		}
		this._onMouseDown(e);
	}

	public delegateMouseDown(browserEvent: MouseEvent): void {
		let e = new StandardMouseEvent(browserEvent);
		let domTop = this.domNode.getClientRects()[0].top;
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
		let domNodePosition = DomUtils.getDomNodePosition(this.domNode);
		let desiredSliderPosition = this._mouseDownRelativePosition(e, domNodePosition) - this._scrollbarState.getArrowSize() - this._scrollbarState.getSliderSize() / 2;
		this.setDesiredScrollPosition(this._scrollbarState.convertSliderPositionToScrollPosition(desiredSliderPosition));
		this._sliderMouseDown(e);
	}

	private _sliderMouseDown(e: IMouseEvent): void {
		if (e.leftButton) {
			let initialMouseOrthogonalPosition = this._sliderOrthogonalMousePosition(e);
			let initialScrollPosition = this._getScrollPosition();
			let draggingDelta = this._sliderMousePosition(e) - this._scrollbarState.getSliderPosition();
			DomUtils.toggleClass(this.slider, 'active', true);

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
					DomUtils.toggleClass(this.slider, 'active', false);
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

	public setDesiredScrollPosition(desiredScrollPosition: number): void {
		desiredScrollPosition = this.validateScrollPosition(desiredScrollPosition);

		this._setScrollPosition(desiredScrollPosition);
		this.onElementScrollPosition(desiredScrollPosition);
		this._renderSlider();
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

function setPosition(domNode: HTMLElement, top: number, left: number, bottom: number, right: number) {
	if (top !== null) {
		domNode.style.top = top + 'px';
	}
	if (left !== null) {
		domNode.style.left = left + 'px';
	}
	if (bottom !== null) {
		domNode.style.bottom = bottom + 'px';
	}
	if (right !== null) {
		domNode.style.right = right + 'px';
	}
}

function setSize(domNode: HTMLElement, width: number, height: number) {
	if (width !== null) {
		domNode.style.width = width + 'px';
	}
	if (height !== null) {
		domNode.style.height = height + 'px';
	}
}
