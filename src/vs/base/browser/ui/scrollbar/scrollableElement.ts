/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/scrollbars';

import * as Browser from 'vs/base/browser/browser';
import * as DomUtils from 'vs/base/browser/dom';
import * as Platform from 'vs/base/common/platform';
import { StandardMouseWheelEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';
import { HorizontalScrollbar } from 'vs/base/browser/ui/scrollbar/horizontalScrollbar';
import { VerticalScrollbar } from 'vs/base/browser/ui/scrollbar/verticalScrollbar';
import { ScrollableElementCreationOptions, ScrollableElementChangeOptions, ScrollableElementResolvedOptions } from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Scrollable, ScrollState, ScrollEvent, INewScrollState, ScrollbarVisibility } from 'vs/base/common/scrollable';
import { Widget } from 'vs/base/browser/ui/widget';
import { TimeoutTimer } from 'vs/base/common/async';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ScrollbarHost } from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import Event, { Emitter } from 'vs/base/common/event';

const HIDE_TIMEOUT = 500;
const SCROLL_WHEEL_SENSITIVITY = 50;

export interface IOverviewRulerLayoutInfo {
	parent: HTMLElement;
	insertBefore: HTMLElement;
}

export class ScrollableElement extends Widget {

	private _options: ScrollableElementResolvedOptions;
	private _scrollable: Scrollable;
	private _verticalScrollbar: VerticalScrollbar;
	private _horizontalScrollbar: HorizontalScrollbar;
	private _domNode: HTMLElement;

	private _leftShadowDomNode: FastDomNode<HTMLElement>;
	private _topShadowDomNode: FastDomNode<HTMLElement>;
	private _topLeftShadowDomNode: FastDomNode<HTMLElement>;

	private _listenOnDomNode: HTMLElement;

	private _mouseWheelToDispose: IDisposable[];

	private _isDragging: boolean;
	private _mouseIsOver: boolean;

	private _hideTimeout: TimeoutTimer;
	private _shouldRender: boolean;

	private _onScroll = this._register(new Emitter<ScrollEvent>());
	public onScroll: Event<ScrollEvent> = this._onScroll.event;

	constructor(element: HTMLElement, options: ScrollableElementCreationOptions, scrollable?: Scrollable) {
		super();
		element.style.overflow = 'hidden';
		this._options = resolveOptions(options);

		if (typeof scrollable === 'undefined') {
			this._scrollable = this._register(new Scrollable());
		} else {
			this._scrollable = scrollable;
		}

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
	public delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void {
		this._verticalScrollbar.delegateMouseDown(browserEvent);
	}

	public getVerticalSliderVerticalCenter(): number {
		return this._verticalScrollbar.getVerticalSliderVerticalCenter();
	}

	public updateState(newState: INewScrollState): void {
		this._scrollable.updateState(newState);
	}

	public getScrollState(): ScrollState {
		return this._scrollable.getState();
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

		this._shouldRender = this._horizontalScrollbar.setCanUseTranslate3d(massagedOptions.canUseTranslate3d) || this._shouldRender;
		this._shouldRender = this._verticalScrollbar.setCanUseTranslate3d(massagedOptions.canUseTranslate3d) || this._shouldRender;

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
		let desiredScrollTop = -1;
		let desiredScrollLeft = -1;

		if (e.deltaY || e.deltaX) {
			let deltaY = e.deltaY * this._options.mouseWheelScrollSensitivity;
			let deltaX = e.deltaX * this._options.mouseWheelScrollSensitivity;

			if (this._options.flipAxes) {
				[deltaY, deltaX] = [deltaX, deltaY];
			}

			if (this._options.scrollYToX && !deltaX) {
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

			const scrollState = this._scrollable.getState();
			if (deltaY) {
				let currentScrollTop = scrollState.scrollTop;
				desiredScrollTop = this._verticalScrollbar.validateScrollPosition((desiredScrollTop !== -1 ? desiredScrollTop : currentScrollTop) - SCROLL_WHEEL_SENSITIVITY * deltaY);
				if (desiredScrollTop === currentScrollTop) {
					desiredScrollTop = -1;
				}
			}
			if (deltaX) {
				let currentScrollLeft = scrollState.scrollLeft;
				desiredScrollLeft = this._horizontalScrollbar.validateScrollPosition((desiredScrollLeft !== -1 ? desiredScrollLeft : currentScrollLeft) - SCROLL_WHEEL_SENSITIVITY * deltaX);
				if (desiredScrollLeft === currentScrollLeft) {
					desiredScrollLeft = -1;
				}
			}

			if (desiredScrollTop !== -1 || desiredScrollLeft !== -1) {
				if (desiredScrollTop !== -1) {
					this._shouldRender = this._verticalScrollbar.setDesiredScrollPosition(desiredScrollTop) || this._shouldRender;
					desiredScrollTop = -1;
				}
				if (desiredScrollLeft !== -1) {
					this._shouldRender = this._horizontalScrollbar.setDesiredScrollPosition(desiredScrollLeft) || this._shouldRender;
					desiredScrollLeft = -1;
				}
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
			const scrollState = this._scrollable.getState();
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
		this.updateState({
			width: this._element.clientWidth,
			scrollWidth: this._element.scrollWidth,
			scrollLeft: this._element.scrollLeft,

			height: this._element.clientHeight,
			scrollHeight: this._element.scrollHeight,
			scrollTop: this._element.scrollTop,
		});
	}
}

function resolveOptions(opts: ScrollableElementCreationOptions): ScrollableElementResolvedOptions {
	let result: ScrollableElementResolvedOptions = {
		canUseTranslate3d: opts.canUseTranslate3d && Browser.canUseTranslate3d,
		lazyRender: (typeof opts.lazyRender !== 'undefined' ? opts.lazyRender : false),
		className: (typeof opts.className !== 'undefined' ? opts.className : ''),
		useShadows: (typeof opts.useShadows !== 'undefined' ? opts.useShadows : true),
		handleMouseWheel: (typeof opts.handleMouseWheel !== 'undefined' ? opts.handleMouseWheel : true),
		flipAxes: (typeof opts.flipAxes !== 'undefined' ? opts.flipAxes : false),
		alwaysConsumeMouseWheel: (typeof opts.alwaysConsumeMouseWheel !== 'undefined' ? opts.alwaysConsumeMouseWheel : false),
		scrollYToX: (typeof opts.scrollYToX !== 'undefined' ? opts.scrollYToX : false),
		mouseWheelScrollSensitivity: (typeof opts.mouseWheelScrollSensitivity !== 'undefined' ? opts.mouseWheelScrollSensitivity : 1),
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
