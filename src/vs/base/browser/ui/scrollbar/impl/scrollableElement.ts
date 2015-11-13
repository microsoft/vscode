/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./scrollbars';
import DomUtils = require('vs/base/browser/dom');
import Mouse = require('vs/base/browser/mouseEvent');
import Platform = require('vs/base/common/platform');
import Common = require('vs/base/browser/ui/scrollbar/impl/common');
import DomNodeScrollable = require('vs/base/browser/ui/scrollbar/impl/domNodeScrollable');
import HorizontalScrollbar = require('vs/base/browser/ui/scrollbar/impl/horizontalScrollbar');
import VerticalScrollbar = require('vs/base/browser/ui/scrollbar/impl/verticalScrollbar');
import ScrollableElementInt = require('vs/base/browser/ui/scrollbar/scrollableElement');
import Lifecycle = require('vs/base/common/lifecycle');
import {IScrollable} from 'vs/base/common/scrollable';

var HIDE_TIMEOUT = 500;
var SCROLL_WHEEL_SENSITIVITY = 50;

export class ScrollableElement implements ScrollableElementInt.IScrollableElement {

	private originalElement:HTMLElement;
	private options:Common.IOptions;
	private scrollable:IScrollable;
	public verticalScrollbarWidth:number;
	public horizontalScrollbarHeight:number;
	private verticalScrollbar:Common.IScrollbar;
	private horizontalScrollbar:Common.IScrollbar;
	private domNode:HTMLElement;

	private leftShadowDomNode:HTMLElement;
	private topShadowDomNode:HTMLElement;
	private topLeftShadowDomNode:HTMLElement;
	private listenOnDomNode:HTMLElement;

	private toDispose:Lifecycle.IDisposable[];
	private _mouseWheelToDispose:Lifecycle.IDisposable[];

	private onElementDimensionsTimeout:number;
	private onElementInternalDimensionsTimeout:number;
	private isDragging:boolean;
	private mouseIsOver:boolean;

	private dimensions:Common.IDimensions;
	private hideTimeout:number;

	constructor(element:HTMLElement, options:ScrollableElementInt.ICreationOptions, dimensions:ScrollableElementInt.IDimensions = null) {
		this.originalElement = element;
		this.originalElement.style.overflow = 'hidden';
		this.options = this._createOptions(options);

		if (this.options.scrollable) {
			this.scrollable = this.options.scrollable;
		} else {
			this.scrollable = new DomNodeScrollable.DomNodeScrollable(this.originalElement);
		}

		this.verticalScrollbarWidth = this.options.verticalScrollbarSize;
		this.horizontalScrollbarHeight = this.options.horizontalScrollbarSize;

		this.verticalScrollbar = new VerticalScrollbar.VerticalScrollbar(this.scrollable, this, this.options);
		this.horizontalScrollbar = new HorizontalScrollbar.HorizontalScrollbar(this.scrollable, this, this.options);

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-scrollable-element ' + this.options.className;
		this.domNode.setAttribute('aria-hidden', 'true');
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.style.position = 'relative';
		this.domNode.style.overflow = 'hidden';
		this.domNode.appendChild(this.originalElement);
		this.domNode.appendChild(this.horizontalScrollbar.domNode);
		this.domNode.appendChild(this.verticalScrollbar.domNode);

		if (this.options.useShadows) {
			this.leftShadowDomNode = document.createElement('div');
			this.leftShadowDomNode.className = 'shadow';
			this.domNode.appendChild(this.leftShadowDomNode);
		}

		if (this.options.useShadows) {
			this.topShadowDomNode = document.createElement('div');
			this.topShadowDomNode.className = 'shadow';
			this.domNode.appendChild(this.topShadowDomNode);

			this.topLeftShadowDomNode = document.createElement('div');
			this.topLeftShadowDomNode.className = 'shadow top-left-corner';
			this.domNode.appendChild(this.topLeftShadowDomNode);
		}

		this.listenOnDomNode = this.options.listenOnDomNode || this.domNode;

		this.toDispose = [];
		this.toDispose.push(this.scrollable.addScrollListener(() => this._onScroll()));

		this._mouseWheelToDispose = [];
		this._setListeningToMouseWheel(this.options.handleMouseWheel);
		this.toDispose.push(DomUtils.addDisposableListener(this.listenOnDomNode, 'mouseover', (e:MouseEvent) => this._onMouseOver(e)));
		this.toDispose.push(DomUtils.addDisposableNonBubblingMouseOutListener(this.listenOnDomNode, (e:MouseEvent) => this._onMouseOut(e)));

		this.onElementDimensionsTimeout = -1;
		this.onElementInternalDimensionsTimeout = -1;
		this.hideTimeout = -1;
		this.isDragging = false;
		this.mouseIsOver = false;

		this.onElementDimensions(dimensions, true);
		this.onElementInternalDimensions(true);
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		this._mouseWheelToDispose = Lifecycle.disposeAll(this._mouseWheelToDispose);
		this.verticalScrollbar.destroy();
		this.horizontalScrollbar.destroy();
		if (this.onElementDimensionsTimeout !== -1) {
			window.clearTimeout(this.onElementDimensionsTimeout);
			this.onElementDimensionsTimeout = -1;
		}
		if (this.onElementInternalDimensionsTimeout !== -1) {
			window.clearTimeout(this.onElementInternalDimensionsTimeout);
			this.onElementInternalDimensionsTimeout = -1;
		}
	}
	public destroy(): void {
		this.dispose();
	}

	public getDomNode():HTMLElement {
		return this.domNode;
	}

	public getOverviewRulerLayoutInfo():ScrollableElementInt.IOverviewRulerLayoutInfo {
		return {
			parent: this.domNode,
			insertBefore: this.verticalScrollbar.domNode,
		};
	}

	private getVerticalSliderDomNode():HTMLElement {
		return this.verticalScrollbar.slider;
	}

	public delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void {
		this.verticalScrollbar.delegateMouseDown(browserEvent);
	}

	public onElementDimensions(dimensions:ScrollableElementInt.IDimensions = null, synchronous:boolean = false): void {
		if (synchronous) {
			this.actualElementDimensions(dimensions);
		} else {
			if (this.onElementDimensionsTimeout === -1) {
				this.onElementDimensionsTimeout = window.setTimeout(() => this.actualElementDimensions(dimensions), 0);
			}
		}
	}

	private actualElementDimensions(dimensions:ScrollableElementInt.IDimensions = null): void {
		this.onElementDimensionsTimeout = -1;
		if (!dimensions) {
			dimensions = {
				width: this.domNode.clientWidth,
				height: this.domNode.clientHeight
			};
		}
		this.dimensions = this._computeDimensions(dimensions.width, dimensions.height);
		this.verticalScrollbar.onElementSize(this.dimensions.height);
		this.horizontalScrollbar.onElementSize(this.dimensions.width);
	}

	public onElementInternalDimensions(synchronous:boolean = false): void {
		if (synchronous) {
			this.actualElementInternalDimensions();
		} else {
			if (this.onElementInternalDimensionsTimeout === -1) {
				this.onElementInternalDimensionsTimeout = window.setTimeout(() => this.actualElementInternalDimensions(), 0);
			}
		}
	}

	private actualElementInternalDimensions(): void {
		this.onElementInternalDimensionsTimeout = -1;
		this.horizontalScrollbar.onElementScrollSize(this.scrollable.getScrollWidth());
		this.verticalScrollbar.onElementScrollSize(this.scrollable.getScrollHeight());
	}

	public updateClassName(newClassName:string): void {
		this.options.className = newClassName;
		// Defaults are different on Macs
		if (Platform.isMacintosh) {
			this.options.className += ' mac';
		}
		this.domNode.className = 'monaco-scrollable-element ' + this.options.className;
	}

	public updateOptions(newOptions:ScrollableElementInt.ICreationOptions):void {
		// only support handleMouseWheel changes for now
		var massagedOptions = this._createOptions(newOptions);
		this.options.handleMouseWheel = massagedOptions.handleMouseWheel;
		this.options.mouseWheelScrollSensitivity = massagedOptions.mouseWheelScrollSensitivity;
		this._setListeningToMouseWheel(this.options.handleMouseWheel);
	}

// -------------------- mouse wheel scrolling --------------------

	private _setListeningToMouseWheel(shouldListen:boolean): void {
		var isListening = (this._mouseWheelToDispose.length > 0);

		if (isListening === shouldListen) {
			// No change
			return;
		}

		// Stop listening (if necessary)
		this._mouseWheelToDispose = Lifecycle.disposeAll(this._mouseWheelToDispose);

		// Start listening (if necessary)
		if (shouldListen) {
			var onMouseWheel = (browserEvent:MouseWheelEvent) => {
				var e = new Mouse.StandardMouseWheelEvent(browserEvent);
				this.onMouseWheel(e);
			};

			this._mouseWheelToDispose.push(DomUtils.addDisposableListener(this.listenOnDomNode, 'mousewheel', onMouseWheel));
			this._mouseWheelToDispose.push(DomUtils.addDisposableListener(this.listenOnDomNode, 'DOMMouseScroll', onMouseWheel));
		}
	}

	public onMouseWheel(e: Common.IMouseWheelEvent): void {
		if (Platform.isMacintosh && e.browserEvent && this.options.saveLastScrollTimeOnClassName) {
			// Mark dom node with timestamp of wheel event
			var target = <HTMLElement>e.browserEvent.target;
			if (target && target.nodeType === 1) {
				var r = DomUtils.findParentWithClass(target, this.options.saveLastScrollTimeOnClassName);
				if (r) {
					r.setAttribute('last-scroll-time', String(new Date().getTime()));
				}
			}
		}

		var desiredScrollTop = -1;
		var desiredScrollLeft = -1;

		if (e.deltaY || e.deltaX) {
			var deltaY = e.deltaY * this.options.mouseWheelScrollSensitivity;
			var deltaX = e.deltaX * this.options.mouseWheelScrollSensitivity;

			if (this.options.flipAxes) {
				deltaY = e.deltaX;
				deltaX = e.deltaY;
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

			if (deltaY) {
				var currentScrollTop = this.scrollable.getScrollTop();
				desiredScrollTop = this.verticalScrollbar.validateScrollPosition((desiredScrollTop !== -1 ? desiredScrollTop : currentScrollTop) - SCROLL_WHEEL_SENSITIVITY * deltaY);
				if (desiredScrollTop === currentScrollTop) {
					desiredScrollTop = -1;
				}
			}
			if (deltaX) {
				var currentScrollLeft = this.scrollable.getScrollLeft();
				desiredScrollLeft = this.horizontalScrollbar.validateScrollPosition((desiredScrollLeft !== -1 ? desiredScrollLeft : currentScrollLeft) - SCROLL_WHEEL_SENSITIVITY * deltaX);
				if (desiredScrollLeft === currentScrollLeft) {
					desiredScrollLeft = -1;
				}
			}

			if (desiredScrollTop !== -1 || desiredScrollLeft !== -1) {
				if (desiredScrollTop !== -1) {
					this.verticalScrollbar.setDesiredScrollPosition(desiredScrollTop);
					desiredScrollTop = -1;
				}
				if (desiredScrollLeft !== -1) {
					this.horizontalScrollbar.setDesiredScrollPosition(desiredScrollLeft);
					desiredScrollLeft = -1;
				}
			}
		}

		e.preventDefault();
		e.stopPropagation();
	}

	private _onScroll(): void {
		var scrollHeight = this.scrollable.getScrollHeight();
		var scrollTop = this.scrollable.getScrollTop();
		var scrollWidth = this.scrollable.getScrollWidth();
		var scrollLeft = this.scrollable.getScrollLeft();

		this.verticalScrollbar.onElementScrollPosition(scrollTop);
		this.horizontalScrollbar.onElementScrollPosition(scrollLeft);

		if (this.options.useShadows) {
			var enableTop = scrollHeight > 0 && scrollTop > 0;
			var enableLeft = this.options.useShadows && scrollWidth > 0 && scrollLeft > 0;

			if (this.topShadowDomNode) {
				DomUtils.toggleClass(this.topShadowDomNode, 'top', enableTop);
			}

			if(this.topLeftShadowDomNode) {
				DomUtils.toggleClass(this.topLeftShadowDomNode, 'top', enableTop);
			}

			if (this.leftShadowDomNode) {
				DomUtils.toggleClass(this.leftShadowDomNode, 'left', enableLeft);
			}

			if (this.topLeftShadowDomNode) {
				DomUtils.toggleClass(this.topLeftShadowDomNode, 'left', enableLeft);
			}
		}

		this._reveal();
	}

// -------------------- fade in / fade out --------------------

	public onDragStart(): void {
		this.isDragging = true;
		this._reveal();
	}

	public onDragEnd(): void {
		this.isDragging = false;
		this._hide();
	}

	private _onMouseOut(e:MouseEvent): void {
		this.mouseIsOver = false;
		this._hide();
	}

	private _onMouseOver(e:MouseEvent): void {
		this.mouseIsOver = true;
		this._reveal();
	}

	private _reveal(): void {
		this.verticalScrollbar.beginReveal();
		this.horizontalScrollbar.beginReveal();
		this._scheduleHide();
	}

	private _hide(): void {
		if (!this.mouseIsOver && !this.isDragging) {
			this.verticalScrollbar.beginHide();
			this.horizontalScrollbar.beginHide();
		}
	}

	private _scheduleHide(): void {
		if (this.hideTimeout !== -1) {
			window.clearTimeout(this.hideTimeout);
		}
		this.hideTimeout = window.setTimeout(this._hide.bind(this), HIDE_TIMEOUT);
	}

// -------------------- size & layout --------------------

	private _computeDimensions(clientWidth:number, clientHeight:number): Common.IDimensions {
		var width = clientWidth;
		var height = clientHeight;

		return {
			width: width,
			height: height
		};
	}

	private _createOptions(options:ScrollableElementInt.ICreationOptions): Common.IOptions {

		function ensureValue<V>(source:any, prop:string, value:V) {
			if (source.hasOwnProperty(prop)) {
				return <V>source[prop];
			}
			return value;
		}

		var result:Common.IOptions = {
			forbidTranslate3dUse: ensureValue(options, 'forbidTranslate3dUse', false),
			className: ensureValue(options, 'className', ''),
			useShadows: ensureValue(options, 'useShadows', true),
			handleMouseWheel: ensureValue(options, 'handleMouseWheel', true),
			flipAxes: ensureValue(options, 'flipAxes', false),
			mouseWheelScrollSensitivity: ensureValue(options, 'mouseWheelScrollSensitivity', 1),
			arrowSize: ensureValue(options, 'arrowSize', 11),

			scrollable: ensureValue<IScrollable>(options, 'scrollable', null),
			listenOnDomNode: ensureValue<HTMLElement>(options, 'listenOnDomNode', null),

			horizontal: Common.visibilityFromString(ensureValue(options, 'horizontal', 'auto')),
			horizontalScrollbarSize: ensureValue(options, 'horizontalScrollbarSize', 10),
			horizontalSliderSize: 0,
			horizontalHasArrows: ensureValue(options, 'horizontalHasArrows', false),

			vertical: Common.visibilityFromString(ensureValue(options, 'vertical', 'auto')),
			verticalScrollbarSize: ensureValue(options, 'verticalScrollbarSize', 10),
			verticalHasArrows: ensureValue(options, 'verticalHasArrows', false),
			verticalSliderSize: 0,

			saveLastScrollTimeOnClassName: ensureValue(options, 'saveLastScrollTimeOnClassName', null)
		};

		result.horizontalSliderSize = ensureValue(options, 'horizontalSliderSize', result.horizontalScrollbarSize);
		result.verticalSliderSize = ensureValue(options, 'verticalSliderSize', result.verticalScrollbarSize);

		// Defaults are different on Macs
		if (Platform.isMacintosh) {
			result.className += ' mac';
		}

		return result;
	}
}
