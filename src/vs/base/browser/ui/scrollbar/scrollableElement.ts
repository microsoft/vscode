/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/scrollbars';

import * as DomUtils from 'vs/base/browser/dom';
import * as Platform from 'vs/base/common/platform';
import { StandardMouseWheelEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { HorizontalScrollbar } from 'vs/base/browser/ui/scrollbar/horizontalScrollbar';
import { VerticalScrollbar } from 'vs/base/browser/ui/scrollbar/verticalScrollbar';
import { ScrollableElementCreationOptions, ScrollableElementChangeOptions, ScrollableElementResolvedOptions } from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Scrollable, ScrollEvent, ScrollbarVisibility, INewScrollDimensions, IScrollDimensions, INewScrollPosition, IScrollPosition } from 'vs/base/common/scrollable';
import { Widget } from 'vs/base/browser/ui/widget';
import { TimeoutTimer } from 'vs/base/common/async';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ScrollbarHost, ISimplifiedMouseEvent } from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import Event, { Emitter } from 'vs/base/common/event';

const HIDE_TIMEOUT = 500;
const SCROLL_WHEEL_SENSITIVITY = 50;
const SCROLL_WHEEL_SMOOTH_SCROLL_THRESHOLD = 1.7;

export interface IOverviewRulerLayoutInfo {
	parent: HTMLElement;
	insertBefore: HTMLElement;
}

export abstract class AbstractScrollableElement extends Widget {

	private readonly _options: ScrollableElementResolvedOptions;
	protected readonly _scrollable: Scrollable;
	private readonly _verticalScrollbar: VerticalScrollbar;
	private readonly _horizontalScrollbar: HorizontalScrollbar;
	private readonly _domNode: HTMLElement;

	private readonly _leftShadowDomNode: FastDomNode<HTMLElement>;
	private readonly _topShadowDomNode: FastDomNode<HTMLElement>;
	private readonly _topLeftShadowDomNode: FastDomNode<HTMLElement>;

	private readonly _listenOnDomNode: HTMLElement;

	private _mouseWheelToDispose: IDisposable[];

	private _isDragging: boolean;
	private _mouseIsOver: boolean;

	private readonly _hideTimeout: TimeoutTimer;
	private _shouldRender: boolean;

	private readonly _onScroll = this._register(new Emitter<ScrollEvent>());
	public onScroll: Event<ScrollEvent> = this._onScroll.event;

	protected constructor(element: HTMLElement, options: ScrollableElementCreationOptions, scrollable?: Scrollable) {
		super();
		element.style.overflow = 'hidden';
		this._options = resolveOptions(options);
		this._scrollable = scrollable;

		this._register(this._scrollable.onScroll((e) => {
			this._onDidScroll(e);
			this._onScroll.fire(e);
		}));

		// this._scrollable = this._register(new DelegateScrollable(scrollable, () => this._onScroll()));

		let scrollbarHost: ScrollbarHost = {
			onMouseWheel: (mouseWheelEvent: StandardMouseWheelEvent) => this._onMouseWheel(mouseWheelEvent),
			onDragStart: () => this._onDragStart(),
			onDragEnd: () => this._onDragEnd(),
		};
		this._verticalScrollbar = this._register(new VerticalScrollbar(this._scrollable, this._options, scrollbarHost));
		this._horizontalScrollbar = this._register(new HorizontalScrollbar(this._scrollable, this._options, scrollbarHost));

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-scrollable-element ' + this._options.className;
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.style.position = 'relative';
		this._domNode.style.overflow = 'hidden';
		this._domNode.appendChild(element);
		this._domNode.appendChild(this._horizontalScrollbar.domNode.domNode);
		this._domNode.appendChild(this._verticalScrollbar.domNode.domNode);

		if (this._options.useShadows) {
			this._leftShadowDomNode = createFastDomNode(document.createElement('div'));
			this._leftShadowDomNode.setClassName('shadow');
			this._domNode.appendChild(this._leftShadowDomNode.domNode);

			this._topShadowDomNode = createFastDomNode(document.createElement('div'));
			this._topShadowDomNode.setClassName('shadow');
			this._domNode.appendChild(this._topShadowDomNode.domNode);

			this._topLeftShadowDomNode = createFastDomNode(document.createElement('div'));
			this._topLeftShadowDomNode.setClassName('shadow top-left-corner');
			this._domNode.appendChild(this._topLeftShadowDomNode.domNode);
		}

		this._listenOnDomNode = this._options.listenOnDomNode || this._domNode;

		this._mouseWheelToDispose = [];
		this._setListeningToMouseWheel(this._options.handleMouseWheel);

		this.onmouseover(this._listenOnDomNode, (e) => this._onMouseOver(e));
		this.onnonbubblingmouseout(this._listenOnDomNode, (e) => this._onMouseOut(e));

		this._hideTimeout = this._register(new TimeoutTimer());
		this._isDragging = false;
		this._mouseIsOver = false;

		this._shouldRender = true;
	}

	public dispose(): void {
		this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);
		super.dispose();
	}

	/**
	 * Get the generated 'scrollable' dom node
	 */
	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo {
		return {
			parent: this._domNode,
			insertBefore: this._verticalScrollbar.domNode.domNode,
		};
	}

	/**
	 * Delegate a mouse down event to the vertical scrollbar.
	 * This is to help with clicking somewhere else and having the scrollbar react.
	 */
	public delegateVerticalScrollbarMouseDown(browserEvent: IMouseEvent): void {
		this._verticalScrollbar.delegateMouseDown(browserEvent);
	}

	/**
	 * Delegate a mouse down event to the vertical scrollbar (directly to the slider!).
	 * This is to help with clicking somewhere else and having the scrollbar react.
	 */
	public delegateSliderMouseDown(e: ISimplifiedMouseEvent, onDragFinished: () => void): void {
		this._verticalScrollbar.delegateSliderMouseDown(e, onDragFinished);
	}

	public getScrollDimensions(): IScrollDimensions {
		return this._scrollable.getScrollDimensions();
	}

	public setScrollDimensions(dimensions: INewScrollDimensions): void {
		this._scrollable.setScrollDimensions(dimensions);
	}

	/**
	 * Update the class name of the scrollable element.
	 */
	public updateClassName(newClassName: string): void {
		this._options.className = newClassName;
		// Defaults are different on Macs
		if (Platform.isMacintosh) {
			this._options.className += ' mac';
		}
		this._domNode.className = 'monaco-scrollable-element ' + this._options.className;
	}

	/**
	 * Update configuration options for the scrollbar.
	 * Really this is Editor.IEditorScrollbarOptions, but base shouldn't
	 * depend on Editor.
	 */
	public updateOptions(newOptions: ScrollableElementChangeOptions): void {
		let massagedOptions = resolveOptions(newOptions);
		this._options.handleMouseWheel = massagedOptions.handleMouseWheel;
		this._options.mouseWheelScrollSensitivity = massagedOptions.mouseWheelScrollSensitivity;
		this._setListeningToMouseWheel(this._options.handleMouseWheel);

		if (!this._options.lazyRender) {
			this._render();
		}
	}

	// -------------------- mouse wheel scrolling --------------------

	private _setListeningToMouseWheel(shouldListen: boolean): void {
		let isListening = (this._mouseWheelToDispose.length > 0);

		if (isListening === shouldListen) {
			// No change
			return;
		}

		// Stop listening (if necessary)
		this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);

		// Start listening (if necessary)
		if (shouldListen) {
			let onMouseWheel = (browserEvent: MouseWheelEvent) => {
				let e = new StandardMouseWheelEvent(browserEvent);
				this._onMouseWheel(e);
			};

			this._mouseWheelToDispose.push(DomUtils.addDisposableListener(this._listenOnDomNode, 'mousewheel', onMouseWheel));
			this._mouseWheelToDispose.push(DomUtils.addDisposableListener(this._listenOnDomNode, 'DOMMouseScroll', onMouseWheel));
		}
	}

	private _onMouseWheel(e: StandardMouseWheelEvent): void {

		if (e.deltaY || e.deltaX) {
			let deltaY = e.deltaY * this._options.mouseWheelScrollSensitivity;
			let deltaX = e.deltaX * this._options.mouseWheelScrollSensitivity;

			if (this._options.flipAxes) {
				[deltaY, deltaX] = [deltaX, deltaY];
			}

			// Convert vertical scrolling to horizontal if shift is held, this
			// is handled at a higher level on Mac
			const shiftConvert = !Platform.isMacintosh && e.browserEvent.shiftKey;
			if ((this._options.scrollYToX || shiftConvert) && !deltaX) {
				deltaX = deltaY;
				deltaY = 0;
			}

			if (Platform.isMacintosh) {
				// Give preference to vertical scrolling
				if (deltaY && Math.abs(deltaX) < 0.2) {
					deltaX = 0;
				}
				if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) {
					deltaX = 0;
				}
			}

			const futureScrollPosition = this._scrollable.getFutureScrollPosition();

			let desiredScrollPosition: INewScrollPosition = {};
			if (deltaY) {
				const desiredScrollTop = futureScrollPosition.scrollTop - SCROLL_WHEEL_SENSITIVITY * deltaY;
				this._verticalScrollbar.writeScrollPosition(desiredScrollPosition, desiredScrollTop);
			}
			if (deltaX) {
				const desiredScrollLeft = futureScrollPosition.scrollLeft - SCROLL_WHEEL_SENSITIVITY * deltaX;
				this._horizontalScrollbar.writeScrollPosition(desiredScrollPosition, desiredScrollLeft);
			}

			// Check that we are scrolling towards a location which is valid
			desiredScrollPosition = this._scrollable.validateScrollPosition(desiredScrollPosition);

			if (futureScrollPosition.scrollLeft !== desiredScrollPosition.scrollLeft || futureScrollPosition.scrollTop !== desiredScrollPosition.scrollTop) {
				// TODO@smooth: [MUST] implement better heuristic for distinguishing inertia scrolling
				// from physical mouse wheels
				const ENABLE_MOUSE_WHEEL_SMOOTH = false;

				// If |∆x| and |∆y| are too small then do not apply smooth scroll animation, because in that case the input source must be a touchpad or something similar.
				const smoothScrollThresholdReached = (
					Math.abs(deltaY) > SCROLL_WHEEL_SMOOTH_SCROLL_THRESHOLD
					|| Math.abs(deltaX) > SCROLL_WHEEL_SMOOTH_SCROLL_THRESHOLD
				);

				if (ENABLE_MOUSE_WHEEL_SMOOTH && this._options.mouseWheelSmoothScroll && smoothScrollThresholdReached) {
					this._scrollable.setScrollPositionSmooth(desiredScrollPosition);
				} else {
					this._scrollable.setScrollPositionNow(desiredScrollPosition);
				}

				this._shouldRender = true;
			}
		}

		if (this._options.alwaysConsumeMouseWheel || this._shouldRender) {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	private _onDidScroll(e: ScrollEvent): void {
		this._shouldRender = this._horizontalScrollbar.onDidScroll(e) || this._shouldRender;
		this._shouldRender = this._verticalScrollbar.onDidScroll(e) || this._shouldRender;

		if (this._options.useShadows) {
			this._shouldRender = true;
		}

		this._reveal();

		if (!this._options.lazyRender) {
			this._render();
		}
	}

	/**
	 * Render / mutate the DOM now.
	 * Should be used together with the ctor option `lazyRender`.
	 */
	public renderNow(): void {
		if (!this._options.lazyRender) {
			throw new Error('Please use `lazyRender` together with `renderNow`!');
		}

		this._render();
	}

	private _render(): void {
		if (!this._shouldRender) {
			return;
		}

		this._shouldRender = false;

		this._horizontalScrollbar.render();
		this._verticalScrollbar.render();

		if (this._options.useShadows) {
			const scrollState = this._scrollable.getCurrentScrollPosition();
			let enableTop = scrollState.scrollTop > 0;
			let enableLeft = scrollState.scrollLeft > 0;

			this._leftShadowDomNode.setClassName('shadow' + (enableLeft ? ' left' : ''));
			this._topShadowDomNode.setClassName('shadow' + (enableTop ? ' top' : ''));
			this._topLeftShadowDomNode.setClassName('shadow top-left-corner' + (enableTop ? ' top' : '') + (enableLeft ? ' left' : ''));
		}
	}

	// -------------------- fade in / fade out --------------------

	private _onDragStart(): void {
		this._isDragging = true;
		this._reveal();
	}

	private _onDragEnd(): void {
		this._isDragging = false;
		this._hide();
	}

	private _onMouseOut(e: IMouseEvent): void {
		this._mouseIsOver = false;
		this._hide();
	}

	private _onMouseOver(e: IMouseEvent): void {
		this._mouseIsOver = true;
		this._reveal();
	}

	private _reveal(): void {
		this._verticalScrollbar.beginReveal();
		this._horizontalScrollbar.beginReveal();
		this._scheduleHide();
	}

	private _hide(): void {
		if (!this._mouseIsOver && !this._isDragging) {
			this._verticalScrollbar.beginHide();
			this._horizontalScrollbar.beginHide();
		}
	}

	private _scheduleHide(): void {
		if (!this._mouseIsOver && !this._isDragging) {
			this._hideTimeout.cancelAndSet(() => this._hide(), HIDE_TIMEOUT);
		}
	}
}

export class ScrollableElement extends AbstractScrollableElement {

	constructor(element: HTMLElement, options: ScrollableElementCreationOptions) {
		options = options || {};
		options.mouseWheelSmoothScroll = false;
		const scrollable = new Scrollable(0, (callback) => DomUtils.scheduleAtNextAnimationFrame(callback));
		super(element, options, scrollable);
		this._register(scrollable);
	}

	public setScrollPosition(update: INewScrollPosition): void {
		this._scrollable.setScrollPositionNow(update);
	}

	public getScrollPosition(): IScrollPosition {
		return this._scrollable.getCurrentScrollPosition();
	}
}

export class SmoothScrollableElement extends AbstractScrollableElement {

	constructor(element: HTMLElement, options: ScrollableElementCreationOptions, scrollable: Scrollable) {
		super(element, options, scrollable);
	}

}

export class DomScrollableElement extends ScrollableElement {

	private _element: HTMLElement;

	constructor(element: HTMLElement, options: ScrollableElementCreationOptions) {
		super(element, options);
		this._element = element;
		this.onScroll((e) => {
			if (e.scrollTopChanged) {
				this._element.scrollTop = e.scrollTop;
			}
			if (e.scrollLeftChanged) {
				this._element.scrollLeft = e.scrollLeft;
			}
		});
		this.scanDomNode();
	}

	public scanDomNode(): void {
		// widh, scrollLeft, scrollWidth, height, scrollTop, scrollHeight
		this.setScrollDimensions({
			width: this._element.clientWidth,
			scrollWidth: this._element.scrollWidth,
			height: this._element.clientHeight,
			scrollHeight: this._element.scrollHeight
		});
		this.setScrollPosition({
			scrollLeft: this._element.scrollLeft,
			scrollTop: this._element.scrollTop,
		});
	}
}

function resolveOptions(opts: ScrollableElementCreationOptions): ScrollableElementResolvedOptions {
	let result: ScrollableElementResolvedOptions = {
		lazyRender: (typeof opts.lazyRender !== 'undefined' ? opts.lazyRender : false),
		className: (typeof opts.className !== 'undefined' ? opts.className : ''),
		useShadows: (typeof opts.useShadows !== 'undefined' ? opts.useShadows : true),
		handleMouseWheel: (typeof opts.handleMouseWheel !== 'undefined' ? opts.handleMouseWheel : true),
		flipAxes: (typeof opts.flipAxes !== 'undefined' ? opts.flipAxes : false),
		alwaysConsumeMouseWheel: (typeof opts.alwaysConsumeMouseWheel !== 'undefined' ? opts.alwaysConsumeMouseWheel : false),
		scrollYToX: (typeof opts.scrollYToX !== 'undefined' ? opts.scrollYToX : false),
		mouseWheelScrollSensitivity: (typeof opts.mouseWheelScrollSensitivity !== 'undefined' ? opts.mouseWheelScrollSensitivity : 1),
		mouseWheelSmoothScroll: (typeof opts.mouseWheelSmoothScroll !== 'undefined' ? opts.mouseWheelSmoothScroll : true),
		arrowSize: (typeof opts.arrowSize !== 'undefined' ? opts.arrowSize : 11),

		listenOnDomNode: (typeof opts.listenOnDomNode !== 'undefined' ? opts.listenOnDomNode : null),

		horizontal: (typeof opts.horizontal !== 'undefined' ? opts.horizontal : ScrollbarVisibility.Auto),
		horizontalScrollbarSize: (typeof opts.horizontalScrollbarSize !== 'undefined' ? opts.horizontalScrollbarSize : 10),
		horizontalSliderSize: (typeof opts.horizontalSliderSize !== 'undefined' ? opts.horizontalSliderSize : 0),
		horizontalHasArrows: (typeof opts.horizontalHasArrows !== 'undefined' ? opts.horizontalHasArrows : false),

		vertical: (typeof opts.vertical !== 'undefined' ? opts.vertical : ScrollbarVisibility.Auto),
		verticalScrollbarSize: (typeof opts.verticalScrollbarSize !== 'undefined' ? opts.verticalScrollbarSize : 10),
		verticalHasArrows: (typeof opts.verticalHasArrows !== 'undefined' ? opts.verticalHasArrows : false),
		verticalSliderSize: (typeof opts.verticalSliderSize !== 'undefined' ? opts.verticalSliderSize : 0)
	};

	result.horizontalSliderSize = (typeof opts.horizontalSliderSize !== 'undefined' ? opts.horizontalSliderSize : result.horizontalScrollbarSize);
	result.verticalSliderSize = (typeof opts.verticalSliderSize !== 'undefined' ? opts.verticalSliderSize : result.verticalScrollbarSize);

	// Defaults are different on Macs
	if (Platform.isMacintosh) {
		result.className += ' mac';
	}

	return result;
}
