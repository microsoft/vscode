/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import DomUtils = require('vs/base/browser/dom');
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {IMouseWheelEvent, IParent, Visibility, IScrollbar} from 'vs/base/browser/ui/scrollbar/impl/common';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger} from 'vs/base/browser/globalMouseMoveMonitor';
import Browser = require('vs/base/browser/browser');
import Platform = require('vs/base/common/platform');

export interface IMouseWheelEventFactory {
	():IMouseWheelEvent;
}

export class ScrollbarState {

	static MINIMUM_SLIDER_SIZE = 20;

	// --- immutable
	private scrollbarSize:number;
	private oppositeScrollbarSize:number;
	private arrowSize:number;

	// --- variables
	private visibleSize:number;
	private scrollSize:number;
	private scrollPosition:number;

	// --- computed variables

	/**
	 * `visibleSize` - `oppositeScrollbarSize`
	 */
	private computedAvailableSize:number;

	/**
	 * `computedAvailableSize` - 2 * `arrowSize`
	 */
	private computedRepresentableSize:number;

	/**
	 * `computedRepresentableSize` / `scrollSize`
	 */
	private computedRatio:number;

	/**
	 * (`scrollSize` > `visibleSize`)
	 */
	private computedIsNeeded:boolean;

	private computedSliderSize:number;
	private computedSliderPosition:number;

	constructor(arrowSize:number, scrollbarSize:number, oppositeScrollbarSize:number) {
		this.visibleSize = 0;
		this.scrollSize = 0;
		this.scrollPosition = 0;
		this.scrollbarSize = scrollbarSize;
		this.oppositeScrollbarSize = oppositeScrollbarSize;
		this.arrowSize = arrowSize;
		this.refreshComputedValues();
	}

	public setVisibleSize(visibleSize:number): boolean {
		if (this.visibleSize !== visibleSize) {
			this.visibleSize = visibleSize;
			this.refreshComputedValues();
			return true;
		}
		return false;
	}

	public setScrollSize(scrollSize:number): boolean {
		if (this.scrollSize !== scrollSize) {
			this.scrollSize = scrollSize;
			this.refreshComputedValues();
			return true;
		}
		return false;
	}

	public setScrollPosition(scrollPosition:number): boolean {
		if (this.scrollPosition !== scrollPosition) {
			this.scrollPosition = scrollPosition;
			this.refreshComputedValues();
			return true;
		}
		return false;
	}

	private refreshComputedValues(): void {
		this.computedAvailableSize = Math.max(0, this.visibleSize - this.oppositeScrollbarSize);
		this.computedRepresentableSize = Math.max(0, this.computedAvailableSize - 2 * this.arrowSize);
		this.computedRatio = this.scrollSize > 0 ? (this.computedRepresentableSize / this.scrollSize) : 0;
		this.computedIsNeeded = (this.scrollSize > this.visibleSize);

		if (!this.computedIsNeeded) {
			this.computedSliderSize = this.computedRepresentableSize;
			this.computedSliderPosition = 0;
		} else {
			this.computedSliderSize = Math.floor(this.visibleSize * this.computedRatio);
			this.computedSliderPosition = Math.floor(this.scrollPosition * this.computedRatio);

			if (this.computedSliderSize < ScrollbarState.MINIMUM_SLIDER_SIZE) {
				// We must artificially increase the size of the slider, since the slider would be too small otherwise
				// The effort is to keep the slider centered around the original position, but we must take into
				// account the cases when the slider is too close to the top or too close to the bottom

				var sliderArtificialOffset = (ScrollbarState.MINIMUM_SLIDER_SIZE - this.computedSliderSize) / 2;
				this.computedSliderSize = ScrollbarState.MINIMUM_SLIDER_SIZE;

				this.computedSliderPosition -= sliderArtificialOffset;

				if (this.computedSliderPosition + this.computedSliderSize > this.computedRepresentableSize) {
					// Slider is too close to the bottom, so we glue it to the bottom
					this.computedSliderPosition = this.computedRepresentableSize - this.computedSliderSize;
				}

				if (this.computedSliderPosition < 0) {
					// Slider is too close to the top, so we glue it to the top
					this.computedSliderPosition = 0;
				}
			}
		}
	}

	public getArrowSize(): number {
		return this.arrowSize;
	}

	public getRectangleLargeSize(): number {
		return this.computedAvailableSize;
	}

	public getRectangleSmallSize(): number {
		return this.scrollbarSize;
	}

	public isNeeded(): boolean {
		return this.computedIsNeeded;
	}

	public getSliderSize(): number {
		return this.computedSliderSize;
	}

	public getSliderPosition(): number {
		return this.computedSliderPosition;
	}

	public convertSliderPositionToScrollPosition(desiredSliderPosition:number): number {
		return desiredSliderPosition / this.computedRatio;
	}

	public validateScrollPosition(desiredScrollPosition:number): number {
		desiredScrollPosition = Math.round(desiredScrollPosition);
		desiredScrollPosition = Math.max(desiredScrollPosition, 0);
		desiredScrollPosition = Math.min(desiredScrollPosition, this.scrollSize - this.visibleSize);

		return desiredScrollPosition;
	}
}

class ScrollbarArrow {
	private parent:IParent;
	private mouseWheelEventFactory:IMouseWheelEventFactory;
	public bgDomNode:HTMLElement;
	public domNode:HTMLElement;
	private toDispose:IDisposable[];
	private interval:number;
	private timeout:number;
	private mouseMoveMonitor:GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	constructor(className:string, top:number, left:number, bottom:number, right:number, bgWidth:number, bgHeight:number, mouseWheelEventFactory:IMouseWheelEventFactory, parent:IParent) {
		this.parent = parent;
		this.mouseWheelEventFactory = mouseWheelEventFactory;

		this.bgDomNode = document.createElement('div');
		this.bgDomNode.className = 'arrow-background';
		this.bgDomNode.style.position = 'absolute';
		setSize(this.bgDomNode, bgWidth, bgHeight);
		setPosition(this.bgDomNode, (top !== null ? 0 : null), (left !== null ? 0 : null), (bottom !== null ? 0 : null), (right !== null ? 0 : null));


		this.domNode  = document.createElement('div');
		this.domNode.className = className;
		this.domNode.style.position = 'absolute';
		setSize(this.domNode, AbstractScrollbar.ARROW_IMG_SIZE, AbstractScrollbar.ARROW_IMG_SIZE);
		setPosition(this.domNode, top, left, bottom, right);

		this.mouseMoveMonitor = new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>();

		this.toDispose = [];
		this.toDispose.push(DomUtils.addDisposableListener(this.bgDomNode, 'mousedown', (e:MouseEvent) => this._arrowMouseDown(e)));
		this.toDispose.push(DomUtils.addDisposableListener(this.domNode, 'mousedown', (e:MouseEvent) => this._arrowMouseDown(e)));
		this.toDispose.push(this.mouseMoveMonitor);
		this.interval = -1;
		this.timeout = -1;
	}

	public dispose(): void {
		this.toDispose = disposeAll(this.toDispose);
		this._clearArrowTimers();
	}

	private _arrowMouseDown(browserEvent:MouseEvent):void {
		var repeater = () => {
			this.parent.onMouseWheel(this.mouseWheelEventFactory());
		};

		var scheduleRepeater = () => {
			this.interval = window.setInterval(repeater, 1000/24);
		};

		repeater();
		this._clearArrowTimers();
		this.timeout = window.setTimeout(scheduleRepeater, 200);

		this.mouseMoveMonitor.startMonitoring(
			standardMouseMoveMerger,
			(mouseMoveData:IStandardMouseMoveEventData) => {
				/* Intentional empty */
			},
			() => {
				this._clearArrowTimers();
			}
		);

		var mouseEvent = new StandardMouseEvent(browserEvent);
		mouseEvent.preventDefault();
	}

	private _clearArrowTimers():void {
		if (this.interval !== -1) {
			window.clearInterval(this.interval);
			this.interval = -1;
		}
		if (this.timeout !== -1) {
			window.clearTimeout(this.timeout);
			this.timeout = -1;
		}
	}
}

class VisibilityController implements IDisposable {
	private visibility:Visibility;
	private visibleClassName:string;
	private invisibleClassName:string;
	private domNode:HTMLElement;
	private shouldBeVisible:boolean;
	private isNeeded:boolean;
	private isVisible:boolean;
	private fadeAwayTimeout:number;

	constructor(visibility:Visibility, visibleClassName:string, invisibleClassName:string) {
		this.visibility = visibility;
		this.visibleClassName = visibleClassName;
		this.invisibleClassName = invisibleClassName;
		this.domNode = null;
		this.isVisible = false;
		this.isNeeded = false;
		this.shouldBeVisible = false;
		this.fadeAwayTimeout = -1;
	}

	public dispose(): void {
		if (this.fadeAwayTimeout !== -1) {
			window.clearTimeout(this.fadeAwayTimeout);
			this.fadeAwayTimeout = -1;
		}
		if (this._revealTimeout !== -1) {
			window.clearTimeout(this._revealTimeout);
			this._revealTimeout = -1;
		}
	}

	// ----------------- Hide / Reveal

	private applyVisibilitySetting(shouldBeVisible:boolean): boolean {
		if (this.visibility === Visibility.Hidden) {
			return false;
		}
		if (this.visibility === Visibility.Visible) {
			return true;
		}
		return shouldBeVisible;
	}

	public setShouldBeVisible(rawShouldBeVisible:boolean): void {
		var shouldBeVisible = this.applyVisibilitySetting(rawShouldBeVisible);

		if (this.shouldBeVisible !== shouldBeVisible) {
			this.shouldBeVisible = shouldBeVisible;
			this.ensureVisibility();
		}
	}

	public setIsNeeded(isNeeded:boolean): void {
		if (this.isNeeded !== isNeeded) {
			this.isNeeded = isNeeded;
			this.ensureVisibility();
		}
	}

	public setDomNode(domNode:HTMLElement): void {
		this.domNode = domNode;
		this.domNode.className = this.invisibleClassName;

		// Now that the flags & the dom node are in a consistent state, ensure the Hidden/Visible configuration
		this.setShouldBeVisible(false);
	}

	public ensureVisibility(): void {

		if (!this.isNeeded) {
			// Nothing to be rendered
			this._hide(false);
			return;
		}

		if (this.shouldBeVisible) {
			this._reveal();
		} else {
			this._hide(true);
		}
	}

	private _revealTimeout:number = -1;
	private _reveal(): void {
		if (this.isVisible) {
			return;
		}
		this.isVisible = true;
		// The CSS animation doesn't play otherwise
		if (this._revealTimeout === -1) {
			this._revealTimeout = window.setTimeout(() => {
				this._revealTimeout = -1;
				this.domNode.className = this.visibleClassName;
			}, 0);
		}

		// Cancel the fade away timeout, if installed
		if (this.fadeAwayTimeout !== -1) {
			window.clearTimeout(this.fadeAwayTimeout);
			this.fadeAwayTimeout = -1;
		}
	}

	private _hide(withFadeAway:boolean): void {
		if (this._revealTimeout !== -1) {
			window.clearTimeout(this._revealTimeout);
			this._revealTimeout = -1;
		}
		if (!this.isVisible) {
			return;
		}
		this.isVisible = false;
		this.domNode.className = this.invisibleClassName + (withFadeAway ? ' fade' : '');
	}
}

export interface IMouseMoveEventData {
	leftButton:boolean;
	posx:number;
	posy:number;
}

export abstract class AbstractScrollbar implements IScrollbar {

	static ARROW_IMG_SIZE = 11;
	/**
	 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
	 */
	static MOUSE_DRAG_RESET_DISTANCE = 140;

	protected forbidTranslate3dUse:boolean;
	private parent:IParent;
	private scrollbarState:ScrollbarState;
	private visibilityController:VisibilityController;
	private mouseMoveMonitor:GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;

	private toDispose:IDisposable[];

	public domNode:HTMLElement;
	public slider:HTMLElement;

	constructor(forbidTranslate3dUse:boolean, parent:IParent, scrollbarState:ScrollbarState, visibility:Visibility, extraScrollbarClassName:string) {
		this.forbidTranslate3dUse = forbidTranslate3dUse;
		this.parent = parent;
		this.scrollbarState = scrollbarState;
		this.visibilityController = new VisibilityController(visibility, 'visible scrollbar ' + extraScrollbarClassName, 'invisible scrollbar ' + extraScrollbarClassName);
		this.mouseMoveMonitor = new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>();

		this.toDispose = [];
		this.toDispose.push(this.visibilityController);
		this.toDispose.push(this.mouseMoveMonitor);
	}

	// ----------------- initialize & clean-up

	/**
	 * Creates the container dom node for the scrollbar & hooks up the events
	 */
	public _createDomNode(): void {
		this.domNode = document.createElement('div');
		if (!this.forbidTranslate3dUse && Browser.canUseTranslate3d) {
			// Put the worker reporter in its own layer
			this.domNode.style.transform = 'translate3d(0px, 0px, 0px)';
		}

		this.visibilityController.setDomNode(this.domNode);
		this.domNode.style.position = 'absolute';

		this.toDispose.push(DomUtils.addDisposableListener(this.domNode, 'mousedown', (e:MouseEvent) => this._domNodeMouseDown(e)));
	}

	/**
	 * Creates the dom node for an arrow & adds it to the container
	 */
	public _createArrow(className:string, top:number, left:number, bottom:number, right:number, bgWidth:number, bgHeight:number, mouseWheelEventFactory:IMouseWheelEventFactory): void {
		var arrow = new ScrollbarArrow(className, top, left, bottom, right, bgWidth, bgHeight, mouseWheelEventFactory, this.parent);
		this.domNode.appendChild(arrow.bgDomNode);
		this.domNode.appendChild(arrow.domNode);
		this.toDispose.push(arrow);
	}

	/**
	 * Creates the slider dom node, adds it to the container & hooks up the events
	 */
	public _createSlider(top:number, left:number, width:number, height:number): void {
		this.slider = document.createElement('div');
		this.slider.className = 'slider';
		this.slider.style.position = 'absolute';
		setPosition(this.slider, top, left, null, null);
		setSize(this.slider, width, height);
		this.domNode.appendChild(this.slider);

		this.toDispose.push(DomUtils.addDisposableListener(this.slider, 'mousedown', (e:MouseEvent) => this._sliderMouseDown(new StandardMouseEvent(e))));
	}

	/**
	 * Clean-up
	 */
	public destroy(): void {
		this.toDispose = disposeAll(this.toDispose);
	}

	// ----------------- Update state

	public onElementSize(visibleSize:number) {
		if (this.scrollbarState.setVisibleSize(visibleSize)) {
			this._renderDomNode(this.scrollbarState.getRectangleLargeSize(), this.scrollbarState.getRectangleSmallSize());
			this._renderSlider();
			this.visibilityController.setIsNeeded(this.scrollbarState.isNeeded());
		}
	}

	public onElementScrollSize(elementScrollSize:number): void {
		if (this.scrollbarState.setScrollSize(elementScrollSize)) {
			this._renderSlider();
			this.visibilityController.setIsNeeded(this.scrollbarState.isNeeded());
		}
	}

	public onElementScrollPosition(elementScrollPosition:number): void {
		if (this.scrollbarState.setScrollPosition(elementScrollPosition)) {
			this._renderSlider();
			this.visibilityController.setIsNeeded(this.scrollbarState.isNeeded());
		}
	}

	// ----------------- rendering

	public beginReveal(): void {
		this.visibilityController.setShouldBeVisible(true);
	}

	public beginHide(): void {
		this.visibilityController.setShouldBeVisible(false);
	}

	private _renderSlider(): void {
		this._updateSlider(this.scrollbarState.getSliderSize(), this.scrollbarState.getArrowSize() + this.scrollbarState.getSliderPosition());
	}

	// ----------------- DOM events

	private _domNodeMouseDown(browserEvent:MouseEvent): void {
		var e = new StandardMouseEvent(browserEvent);
		if (e.target !== this.domNode) {
			return;
		}
		this._onMouseDown(e);
	}

	public delegateMouseDown(browserEvent:MouseEvent): void {
		var e = new StandardMouseEvent(browserEvent);
		var domTop = this.domNode.getClientRects()[0].top;
		var sliderStart = domTop + this.scrollbarState.getSliderPosition();
		var sliderStop = domTop + this.scrollbarState.getSliderPosition() + this.scrollbarState.getSliderSize();
		var mousePos = this._sliderMousePosition(e);
		if (sliderStart <= mousePos && mousePos <= sliderStop) {
			// Act as if it was a mouse down on the slider
			this._sliderMouseDown(e);
		} else {
			// Act as if it was a mouse down on the scrollbar
			this._onMouseDown(e);
		}
	}

	private _onMouseDown(e:StandardMouseEvent): void {
		var domNodePosition = DomUtils.getDomNodePosition(this.domNode);
		var desiredSliderPosition = this._mouseDownRelativePosition(e, domNodePosition) - this.scrollbarState.getArrowSize() - this.scrollbarState.getSliderSize() / 2;
		this.setDesiredScrollPosition(this.scrollbarState.convertSliderPositionToScrollPosition(desiredSliderPosition));
		this._sliderMouseDown(e);
	}

	private _sliderMouseDown(e:StandardMouseEvent): void {
		if (e.leftButton) {
			var initialMouseOrthogonalPosition = this._sliderOrthogonalMousePosition(e);
			var initialScrollPosition = this._getScrollPosition();
			var draggingDelta = this._sliderMousePosition(e) - this.scrollbarState.getSliderPosition();
			DomUtils.toggleClass(this.slider, 'active', true);

			this.mouseMoveMonitor.startMonitoring(
				standardMouseMoveMerger,
				(mouseMoveData:IStandardMouseMoveEventData) => {
					var mouseOrthogonalPosition = this._sliderOrthogonalMousePosition(mouseMoveData);
					var mouseOrthogonalDelta = Math.abs(mouseOrthogonalPosition - initialMouseOrthogonalPosition);
					// console.log(initialMouseOrthogonalPosition + ' -> ' + mouseOrthogonalPosition + ': ' + mouseOrthogonalDelta);
					if (Platform.isWindows && mouseOrthogonalDelta > AbstractScrollbar.MOUSE_DRAG_RESET_DISTANCE) {
						// The mouse has wondered away from the scrollbar => reset dragging
						this.setDesiredScrollPosition(initialScrollPosition);
					} else {
						var desiredSliderPosition = this._sliderMousePosition(mouseMoveData) - draggingDelta;
						this.setDesiredScrollPosition(this.scrollbarState.convertSliderPositionToScrollPosition(desiredSliderPosition));
					}
				},
				() => {
					DomUtils.toggleClass(this.slider, 'active', false);
					this.parent.onDragEnd();
				}
			);

			e.preventDefault();
			this.parent.onDragStart();
		}
	}

	public validateScrollPosition(desiredScrollPosition:number): number {
		return this.scrollbarState.validateScrollPosition(desiredScrollPosition);
	}

	public setDesiredScrollPosition(desiredScrollPosition:number): void {
		desiredScrollPosition = this.validateScrollPosition(desiredScrollPosition);

		this._setScrollPosition(desiredScrollPosition);
		this.onElementScrollPosition(desiredScrollPosition);
		this._renderSlider();
	}

	// ----------------- Overwrite these

	public _renderDomNode(largeSize:number, smallSize:number): void {
	}

	public _updateSlider(sliderSize:number, sliderPosition:number): void {
	}

	public _mouseDownRelativePosition(e:StandardMouseEvent, domNodePosition:DomUtils.IDomNodePosition): number {
		return 0;
	}

	public _sliderMousePosition(e:IMouseMoveEventData): number {
		return 0;
	}

	public _sliderOrthogonalMousePosition(e:IMouseMoveEventData): number {
		return 0;
	}

	public _getScrollPosition(): number {
		return 0;
	}

	public _setScrollPosition(elementScrollPosition:number): void {
	}
}

function toPx(value) {
	return value + 'px';
}

function setPosition(domNode:HTMLElement, top:number, left:number, bottom:number, right:number) {
	if (top !== null) {
		domNode.style.top = toPx(top);
	}
	if (left !== null) {
		domNode.style.left = toPx(left);
	}
	if (bottom !== null) {
		domNode.style.bottom = toPx(bottom);
	}
	if (right !== null) {
		domNode.style.right = toPx(right);
	}
}

function setSize(domNode:HTMLElement, width:number, height:number) {
	if (width !== null) {
		domNode.style.width = toPx(width);
	}
	if (height !== null) {
		domNode.style.height = toPx(height);
	}
}
