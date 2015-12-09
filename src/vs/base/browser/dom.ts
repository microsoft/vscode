/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Browser = require('vs/base/browser/browser');
import Types = require('vs/base/common/types');
import Emitter = require('vs/base/common/eventEmitter');
import Lifecycle = require('vs/base/common/lifecycle');
import mouseEvent = require('vs/base/browser/mouseEvent');
import keyboardEvent = require('vs/base/browser/keyboardEvent');
import errors = require('vs/base/common/errors');
import browserService = require('vs/base/browser/browserService');

export type IKeyboardEvent = keyboardEvent.IKeyboardEvent;
export type IMouseEvent = mouseEvent.IMouseEvent;

export function clearNode (node:HTMLElement) {
	while (node.firstChild) {
		node.removeChild(node.firstChild);
	}
}

/**
 * Calls JSON.Stringify with a replacer to break apart any circular references.
 * This prevents JSON.stringify from throwing the exception
 *  "Uncaught TypeError: Converting circular structure to JSON"
 */
export function safeStringifyDOMAware(obj: any):string {
	var seen:any[] = [];
	return JSON.stringify(obj, (key, value) => {

		// HTML elements are never going to serialize nicely
		if(value instanceof Element) {
			return '[Element]';
		}

		if(Types.isObject(value) || Array.isArray(value)) {
			if(seen.indexOf(value) !== -1) {
				return '[Circular]';
			} else {
				seen.push(value);
			}
		}
		return value;
	});
}

export function isInDOM(node:Node):boolean {
	while (node) {
		if (node === document.body) {
			return true;
		}
		node = node.parentNode;
	}
	return false;
}

var _blank = ' '.charCodeAt(0);
var lastStart:number, lastEnd:number;

function _findClassName(node:HTMLElement, className:string): void {

	var classes = node.className;
	if(!classes) {
		lastStart = -1;
		return;
	}

	className = className.trim();

	var classesLen = classes.length,
		classLen = className.length;

	if(classLen === 0) {
		lastStart = -1;
		return;
	}

	if(classesLen < classLen) {
		lastStart = -1;
		return;
	}

	if(classes === className) {
		lastStart = 0;
		lastEnd = classesLen;
		return;
	}

	var idx = -1,
		idxEnd:number;

	while ((idx = classes.indexOf(className, idx + 1)) >= 0) {

		idxEnd = idx + classLen;

		// a class that is followed by another class
		if((idx === 0 || classes.charCodeAt(idx - 1) === _blank) && classes.charCodeAt(idxEnd) === _blank) {
			lastStart = idx;
			lastEnd = idxEnd + 1;
			return;
		}

		// last class
		if(idx > 0 && classes.charCodeAt(idx - 1) === _blank && idxEnd === classesLen) {
			lastStart = idx - 1;
			lastEnd = idxEnd;
			return;
		}

		// equal - duplicate of cmp above
		if(idx === 0 && idxEnd === classesLen) {
			lastStart = 0;
			lastEnd = idxEnd;
			return;
		}
	}

	lastStart = -1;
}

/**
 * @param node a dom node
 * @param className a class name
 * @return true if the className attribute of the provided node contains the provided className
 */
export function hasClass(node:HTMLElement, className:string): boolean {
	_findClassName(node, className);
	return lastStart !== -1;
}

/**
 * Adds the provided className to the provided node. This is a no-op
 * if the class is already set.
 * @param node a dom node
 * @param className a class name
 */
export function addClass(node:HTMLElement, className:string): void {
	if(!node.className) { // doesn't have it for sure
		node.className = className;
	} else {
		_findClassName(node, className); // see if it's already there
		if(lastStart === -1) {
			node.className = node.className + ' ' + className;
		}
	}
}

/**
 * Removes the className for the provided node. This is a no-op
 * if the class isn't present.
 * @param node a dom node
 * @param className a class name
 */
export function removeClass(node:HTMLElement, className:string): void {
	_findClassName(node, className);
	if (lastStart === -1) {
		return; // Prevent styles invalidation if not necessary
	} else {
		node.className = node.className.substring(0, lastStart) + node.className.substring(lastEnd);
	}
}

/**
 * @param node a dom node
 * @param className a class name
 * @param shouldHaveIt
 */
export function toggleClass(node:HTMLElement, className:string, shouldHaveIt?:boolean): void {
	_findClassName(node, className);
	if(lastStart !== -1 && !shouldHaveIt) {
		removeClass(node, className);
	}
	if(lastStart === -1 && shouldHaveIt) {
		addClass(node, className);
	}
}

export var StyleMutator = {
	setMaxWidth: (domNode:HTMLElement, maxWidth:number) => {
		var desiredValue = maxWidth + 'px';
		if (domNode.style.maxWidth !== desiredValue) {
			domNode.style.maxWidth = desiredValue;
		}
	},
	setWidth: (domNode:HTMLElement, width:number) => {
		var desiredValue = width + 'px';
		if (domNode.style.width !== desiredValue) {
			domNode.style.width = desiredValue;
		}
	},
	setHeight: (domNode:HTMLElement, height:number) => {
		var desiredValue = height + 'px';
		if (domNode.style.height !== desiredValue) {
			domNode.style.height = desiredValue;
		}
	},
	setTop: (domNode:HTMLElement, top:number) => {
		var desiredValue = top + 'px';
		if (domNode.style.top !== desiredValue) {
			domNode.style.top = desiredValue;
		}
	},
	setLeft: (domNode:HTMLElement, left:number) => {
		var desiredValue = left + 'px';
		if (domNode.style.left !== desiredValue) {
			domNode.style.left = desiredValue;
		}
	},
	setBottom: (domNode:HTMLElement, bottom:number) => {
		var desiredValue = bottom + 'px';
		if (domNode.style.bottom !== desiredValue) {
			domNode.style.bottom = desiredValue;
		}
	},
	setRight: (domNode:HTMLElement, right:number) => {
		var desiredValue = right + 'px';
		if (domNode.style.right !== desiredValue) {
			domNode.style.right = desiredValue;
		}
	},
	setFontSize: (domNode:HTMLElement, fontSize:number) => {
		var desiredValue = fontSize + 'px';
		if (domNode.style.fontSize !== desiredValue) {
			domNode.style.fontSize = desiredValue;
		}
	},
	setLineHeight: (domNode:HTMLElement, lineHeight:number) => {
		var desiredValue = lineHeight + 'px';
		if (domNode.style.lineHeight !== desiredValue) {
			domNode.style.lineHeight = desiredValue;
		}
	},
	setTransform: null,
	setDisplay: (domNode:HTMLElement, desiredValue:string) => {
		if (domNode.style.display !== desiredValue) {
			domNode.style.display = desiredValue;
		}
	},
	setVisibility: (domNode:HTMLElement, desiredValue:string) => {
		if (domNode.style.visibility !== desiredValue) {
			domNode.style.visibility = desiredValue;
		}
	},
};

// Define setTransform
function setWebkitTransform(domNode: HTMLElement, desiredValue: string): void {
	if (domNode.getAttribute('data-transform') !== desiredValue) {
		domNode.setAttribute('data-transform', desiredValue);
		(<any>domNode.style).webkitTransform = desiredValue;
	}
}
function setTransform(domNode: HTMLElement, desiredValue: string): void {
	if (domNode.getAttribute('data-transform') !== desiredValue) {
		domNode.setAttribute('data-transform', desiredValue);
		domNode.style.transform = desiredValue;
	}
}
(function () {
	var testDomNode = document.createElement('div');
	if (typeof (<any>testDomNode.style).webkitTransform !== 'undefined') {
		StyleMutator.setTransform = setWebkitTransform;
	} else {
		StyleMutator.setTransform = setTransform;
	}
})();

export function addListener(node:Element, type:string, handler:(event:any)=>void, useCapture?:boolean):()=>void;
export function addListener(node:Window, type:string, handler:(event:any)=>void, useCapture?:boolean):()=>void;
export function addListener(node:Document, type:string, handler:(event:any)=>void, useCapture?:boolean):()=>void;
export function addListener(node:any, type:string, handler:(event:any)=>void, useCapture?:boolean):()=>void {
	var wrapHandler = function (e):void {
		e = e || window.event;
		handler(e);
	};

	if (Types.isFunction(node.addEventListener)) {
		node.addEventListener(type, wrapHandler, useCapture || false);
		return function () {
			if (!wrapHandler) {
				// Already removed
				return;
			}
			node.removeEventListener(type, wrapHandler, useCapture || false);

			// Prevent leakers from holding on to the dom node or handler func
			wrapHandler = null;
			node = null;
			handler = null;
		};
	}

	node.attachEvent('on' + type, wrapHandler);
	return function () { node.detachEvent('on' + type, wrapHandler); };
}

export function addDisposableListener(node:Element, type:string, handler:(event:any)=>void, useCapture?:boolean): Lifecycle.IDisposable;
export function addDisposableListener(node:Window, type:string, handler:(event:any)=>void, useCapture?:boolean): Lifecycle.IDisposable;
export function addDisposableListener(node:Document, type:string, handler:(event:any)=>void, useCapture?:boolean): Lifecycle.IDisposable;
export function addDisposableListener(node:any, type:string, handler:(event:any)=>void, useCapture?:boolean): Lifecycle.IDisposable {
	var dispose = addListener(node, type, handler, useCapture);
	return {
		dispose: dispose
	};
}

export interface IAddStandardDisposableListenerSignature {
	(node:HTMLElement, type:'click', handler:(event:IMouseEvent)=>void, useCapture?:boolean): Lifecycle.IDisposable;
	(node:HTMLElement, type:'keydown', handler:(event:IKeyboardEvent)=>void, useCapture?:boolean): Lifecycle.IDisposable;
	(node:HTMLElement, type:'keypress', handler:(event:IKeyboardEvent)=>void, useCapture?:boolean): Lifecycle.IDisposable;
	(node:HTMLElement, type:'keyup', handler:(event:IKeyboardEvent)=>void, useCapture?:boolean): Lifecycle.IDisposable;
	(node:HTMLElement, type:string, handler:(event:any)=>void, useCapture?:boolean): Lifecycle.IDisposable;
}
function _wrapAsStandardMouseEvent(handler:(e:IMouseEvent)=>void): (e:MouseEvent) => void {
	return function (e:MouseEvent) {
		return handler(new mouseEvent.StandardMouseEvent(e));
	};
}
function _wrapAsStandardKeyboardEvent(handler:(e:IKeyboardEvent)=>void): (e:KeyboardEvent) => void {
	return function (e:KeyboardEvent) {
		return handler(new keyboardEvent.StandardKeyboardEvent(e));
	};
}
export var addStandardDisposableListener:IAddStandardDisposableListenerSignature = function addStandardDisposableListener(node:HTMLElement, type:string, handler:(event:any)=>void, useCapture?:boolean): Lifecycle.IDisposable {
	var wrapHandler = handler;

	if (type === 'click') {
		wrapHandler = _wrapAsStandardMouseEvent(handler);
	} else if (type === 'keydown' || type === 'keypress' || type === 'keyup') {
		wrapHandler = _wrapAsStandardKeyboardEvent(handler);
	}

	node.addEventListener(type, wrapHandler, useCapture || false);
	return {
		dispose: function () {
			if (!wrapHandler) {
				// Already removed
				return;
			}
			node.removeEventListener(type, wrapHandler, useCapture || false);

			// Prevent leakers from holding on to the dom node or handler func
			wrapHandler = null;
			node = null;
			handler = null;
		}
	};
};

export function addNonBubblingMouseOutListener(node:Element, handler:(event:any)=>void):()=>void {
	return addListener(node, 'mouseout', (e:MouseEvent) => {
		// Mouse out bubbles, so this is an attempt to ignore faux mouse outs coming from children elements
		var toElement = <Node>(e.relatedTarget || e.toElement);
		while (toElement && toElement !== node) {
			toElement = toElement.parentNode;
		}
		if (toElement === node) {
			return;
		}

		handler(e);
	});
}
export function addDisposableNonBubblingMouseOutListener(node:Element, handler:(event:MouseEvent)=>void): Lifecycle.IDisposable {
	var dispose = addNonBubblingMouseOutListener(node, handler);
	return {
		dispose: dispose
	};
}

var _animationFrame = (function() {
	var emulatedRequestAnimationFrame = (callback:(time:number)=>void):number => {
		return setTimeout(() => callback(new Date().getTime()), 0);
	};
	var nativeRequestAnimationFrame:(callback:(time:number)=>void)=>number =
			self.requestAnimationFrame
			|| (<any>self).msRequestAnimationFrame
			|| (<any>self).webkitRequestAnimationFrame
			|| (<any>self).mozRequestAnimationFrame
			|| (<any>self).oRequestAnimationFrame;



	var emulatedCancelAnimationFrame = (id:number) => {};
	var nativeCancelAnimationFrame:(id:number)=>void =
			self.cancelAnimationFrame || (<any>self).cancelRequestAnimationFrame
			|| (<any>self).msCancelAnimationFrame || (<any>self).msCancelRequestAnimationFrame
			|| (<any>self).webkitCancelAnimationFrame || (<any>self).webkitCancelRequestAnimationFrame
			|| (<any>self).mozCancelAnimationFrame || (<any>self).mozCancelRequestAnimationFrame
			|| (<any>self).oCancelAnimationFrame || (<any>self).oCancelRequestAnimationFrame;

	var isNative = !!nativeRequestAnimationFrame;
	var request = nativeRequestAnimationFrame || emulatedRequestAnimationFrame;
	var cancel = nativeCancelAnimationFrame || nativeCancelAnimationFrame;

	return {
		isNative: isNative,
		request: (callback:(time:number)=>void): number => {
			return request(callback);
		},
		cancel: (id:number) => {
			return cancel(id);
		}
	};
})();

/**
 * Schedule a callback to be run at the next animation frame.
 * This allows multiple parties to register callbacks that should run at the next animation frame.
 * If currently in an animation frame, `runner` will be executed immediately.
 * @return token that can be used to cancel the scheduled runner (only if `runner` was not executed immediately).
 */
export var runAtThisOrScheduleAtNextAnimationFrame:(runner:()=>void, priority?:number)=>Lifecycle.IDisposable;
/**
 * Schedule a callback to be run at the next animation frame.
 * This allows multiple parties to register callbacks that should run at the next animation frame.
 * If currently in an animation frame, `runner` will be executed at the next animation frame.
 * @return token that can be used to cancel the scheduled runner.
 */
export var scheduleAtNextAnimationFrame:(runner:()=>void, priority?:number)=>Lifecycle.IDisposable;

class AnimationFrameQueueItem implements Lifecycle.IDisposable {

	private _runner: () => void;
	public priority: number;
	private _canceled: boolean;

	constructor(runner: () => void, priority: number) {
		this._runner = runner;
		this.priority = priority;
		this._canceled = false;
	}

	public dispose(): void {
		this._canceled = true;
	}

	public execute(): void {
		if (this._canceled) {
			return;
		}

		try {
			this._runner();
		} catch (e) {
			errors.onUnexpectedError(e);
		}
	}

	// Sort by priority (largest to lowest)
	public static sort(a: AnimationFrameQueueItem, b: AnimationFrameQueueItem): number {
		return b.priority - a.priority;
	}
}

(function() {
	/**
	 * The runners scheduled at the next animation frame
	 */
	var NEXT_QUEUE: AnimationFrameQueueItem[] = [];
	/**
	 * The runners scheduled at the current animation frame
	 */
	var CURRENT_QUEUE: AnimationFrameQueueItem[] = null;
	/**
	 * A flag to keep track if the native requestAnimationFrame was already called
	 */
	var animFrameRequested = false;
	/**
	 * A flag to indicate if currently handling a native requestAnimationFrame callback
	 */
	var inAnimationFrameRunner = false;

	var animationFrameRunner = () => {
		animFrameRequested = false;

		CURRENT_QUEUE = NEXT_QUEUE;
		NEXT_QUEUE = [];

		inAnimationFrameRunner = true;
		while (CURRENT_QUEUE.length > 0) {
			CURRENT_QUEUE.sort(AnimationFrameQueueItem.sort);
			var top = CURRENT_QUEUE.shift();
			top.execute();
		}
		inAnimationFrameRunner = false;
	};

	scheduleAtNextAnimationFrame = (runner:()=>void, priority:number = 0) => {
		var item = new AnimationFrameQueueItem(runner, priority);
		NEXT_QUEUE.push(item);

		if (!animFrameRequested) {
			animFrameRequested = true;

			// TODO@Alex: also check if it is electron
			if (Browser.isChrome) {
				var handle:number;
				_animationFrame.request(function () {
					clearTimeout(handle);
					animationFrameRunner();
				});
				// This is a fallback in-case chrome dropped
				// the request for an animation frame. This
				// is sick but was spotted in the wild
				handle = setTimeout(animationFrameRunner, 1000);
			} else {
				_animationFrame.request(animationFrameRunner);
			}
		}

		return item;
	};

	runAtThisOrScheduleAtNextAnimationFrame = (runner:()=>void, priority?:number) => {
		if (inAnimationFrameRunner) {
			var item = new AnimationFrameQueueItem(runner, priority);
			CURRENT_QUEUE.push(item);
			return item;
		} else {
			return scheduleAtNextAnimationFrame(runner, priority);
		}
	};
})();

/// <summary>
/// Add a throttled listener. `handler` is fired at most every 16ms or with the next animation frame (if browser supports it).
/// </summary>
export interface IEventMerger<R> {
	(lastEvent:R, currentEvent:Event):R;
}

var MINIMUM_TIME_MS = 16;
var DEFAULT_EVENT_MERGER:IEventMerger<Event> = function (lastEvent:Event, currentEvent:Event) {
	return currentEvent;
};

function timeoutThrottledListener<R>(node:any, type:string, handler:(event:R)=>void, eventMerger:IEventMerger<R> = <any>DEFAULT_EVENT_MERGER, minimumTimeMs:number = MINIMUM_TIME_MS):()=>void {
	var lastEvent:R = null, lastHandlerTime = 0, timeout = -1;

	function invokeHandler(): void {
		timeout = -1;
		lastHandlerTime = (new Date()).getTime();
		handler(lastEvent);
		lastEvent = null;
	};

	var unbinder = addListener(node, type, function (e) {
		lastEvent = eventMerger(lastEvent, e);
		var elapsedTime = (new Date()).getTime() - lastHandlerTime;

		if (elapsedTime >= minimumTimeMs) {
			if (timeout !== -1) {
				window.clearTimeout(timeout);
			}
			invokeHandler();
		} else {
			if (timeout === -1) {
				timeout = window.setTimeout(invokeHandler, minimumTimeMs - elapsedTime);
			}
		}
	});

	return function () {
		if (timeout !== -1) {
			window.clearTimeout(timeout);
		}
		unbinder();
	};
}

export function addThrottledListener<R>(node:any, type:string, handler:(event:R)=>void, eventMerger?:IEventMerger<R>, minimumTimeMs?:number):()=>void {
	return timeoutThrottledListener(node, type, handler, eventMerger, minimumTimeMs);
}

export function addDisposableThrottledListener<R>(node:any, type:string, handler:(event:R)=>void, eventMerger?:IEventMerger<R>, minimumTimeMs?:number):Lifecycle.IDisposable {
	var dispose = addThrottledListener(node, type, handler, eventMerger, minimumTimeMs);
	return {
		dispose: dispose
	};
}

export function getComputedStyle(el:HTMLElement):CSSStyleDeclaration {
	return document.defaultView.getComputedStyle(el, null);
}

// Adapted from WinJS
// Converts a CSS positioning string for the specified element to pixels.
var convertToPixels:(element:HTMLElement, value:string)=>number = (function() {
	var pixelsRE = /^-?\d+(\.\d+)?(px)?$/i;
	var numberRE = /^-?\d+(\.\d+)?/i;
	return function(element:HTMLElement, value:string):number {
		return parseFloat(value) || 0;
	};
})();

function getDimension(element:HTMLElement, cssPropertyName:string, jsPropertyName:string):number {
	var computedStyle:CSSStyleDeclaration = getComputedStyle(element);
	var value = '0';
	if (computedStyle) {
		if (computedStyle.getPropertyValue) {
			value = computedStyle.getPropertyValue(cssPropertyName);
		} else {
			// IE8
			value = (<any>computedStyle).getAttribute(jsPropertyName);
		}
	}
	return convertToPixels(element, value);
}

var sizeUtils = {

	getBorderLeftWidth: function (element:HTMLElement):number {
		return getDimension(element, 'border-left-width', 'borderLeftWidth');
	},
	getBorderTopWidth: function (element:HTMLElement):number {
		return getDimension(element, 'border-top-width', 'borderTopWidth');
	},
	getBorderRightWidth: function (element:HTMLElement):number {
		return getDimension(element, 'border-right-width', 'borderRightWidth');
	},
	getBorderBottomWidth: function (element:HTMLElement):number {
		return getDimension(element, 'border-bottom-width', 'borderBottomWidth');
	},

	getPaddingLeft: function (element:HTMLElement):number {
		return getDimension(element, 'padding-left', 'paddingLeft');
	},
	getPaddingTop: function (element:HTMLElement):number {
		return getDimension(element, 'padding-top', 'paddingTop');
	},
	getPaddingRight: function (element:HTMLElement):number {
		return getDimension(element, 'padding-right', 'paddingRight');
	},
	getPaddingBottom: function (element:HTMLElement):number {
		return getDimension(element, 'padding-bottom', 'paddingBottom');
	},

	getMarginLeft: function (element:HTMLElement):number {
		return getDimension(element, 'margin-left', 'marginLeft');
	},
	getMarginTop: function (element:HTMLElement):number {
		return getDimension(element, 'margin-top', 'marginTop');
	},
	getMarginRight: function (element:HTMLElement):number {
		return getDimension(element, 'margin-right', 'marginRight');
	},
	getMarginBottom: function (element:HTMLElement):number {
		return getDimension(element, 'margin-bottom', 'marginBottom');
	},
	__commaSentinel: false
};

// ----------------------------------------------------------------------------------------
// Position & Dimension

export function getTopLeftOffset (element:HTMLElement):{left:number; top:number;} {
	// Adapted from WinJS.Utilities.getPosition
	// and added borders to the mix

	var offsetParent = element.offsetParent, top = element.offsetTop, left = element.offsetLeft;

	while ((element = <HTMLElement>element.parentNode) !== null && element !== document.body && element !== document.documentElement) {
		top -= element.scrollTop;
		var c = getComputedStyle(element);
		if (c) {
			left -= c.direction !== 'rtl' ? element.scrollLeft : -element.scrollLeft;
		}

		if (element === offsetParent) {
			left += sizeUtils.getBorderLeftWidth(element);
			top += sizeUtils.getBorderTopWidth(element);
			top += element.offsetTop;
			left += element.offsetLeft;
			offsetParent = element.offsetParent;
		}
	}

	return {
		left: left,
		top: top
	};
}

export interface IDomNodePosition {
	left:number;
	top:number;
	width:number;
	height:number;
}

export function getDomNodePosition (domNode:HTMLElement):IDomNodePosition {
	var r = getTopLeftOffset(domNode);
	return {
		left: r.left,
		top: r.top,
		width: domNode.clientWidth,
		height: domNode.clientHeight
	};
}

// Adapted from WinJS
// Gets the width of the content of the specified element. The content width does not include borders or padding.
export function getContentWidth(element:HTMLElement):number {
	var border = sizeUtils.getBorderLeftWidth(element) + sizeUtils.getBorderRightWidth(element);
	var padding = sizeUtils.getPaddingLeft(element) + sizeUtils.getPaddingRight(element);
	return element.offsetWidth - border - padding;
}

// Adapted from WinJS
// Gets the width of the element, including margins.
export function getTotalWidth(element:HTMLElement):number {
	var margin = sizeUtils.getMarginLeft(element) + sizeUtils.getMarginRight(element);
	return element.offsetWidth + margin;
}

// Adapted from WinJS
// Gets the height of the content of the specified element. The content height does not include borders or padding.
export function getContentHeight(element:HTMLElement):number {
	var border = sizeUtils.getBorderTopWidth(element) + sizeUtils.getBorderBottomWidth(element);
	var padding = sizeUtils.getPaddingTop(element) + sizeUtils.getPaddingBottom(element);
	return element.offsetHeight - border - padding;
}

// Adapted from WinJS
// Gets the height of the element, including its margins.
export function getTotalHeight(element:HTMLElement):number {
	var margin = sizeUtils.getMarginTop(element) + sizeUtils.getMarginBottom(element);
	return element.offsetHeight + margin;
}

// Adapted from WinJS
// Gets the left coordinate of the specified element relative to the specified parent.
export function getRelativeLeft(element:HTMLElement, parent:HTMLElement):number {
	if (element === null) {
		return 0;
	}

	var left = element.offsetLeft;
	var e = <HTMLElement>element.parentNode;
	while (e !== null) {
		left -= e.offsetLeft;

		if (e === parent) {
			break;
		}
		e = <HTMLElement>e.parentNode;
	}

	return left;
}

// Adapted from WinJS
// Gets the top coordinate of the element relative to the specified parent.
export function getRelativeTop(element:HTMLElement, parent:HTMLElement):number {
	if (element === null) {
		return 0;
	}

	var top = element.offsetTop;
	var e = <HTMLElement>element.parentNode;
	while (e !== null) {
		top -= e.offsetTop;

		if (e === parent) {
			break;
		}
		e = <HTMLElement>e.parentNode;
	}

	return top;
}

// ----------------------------------------------------------------------------------------

export function isAncestor (testChild:Node, testAncestor:Node):boolean {
	while(testChild) {
		if (testChild === testAncestor) {
			return true;
		}
		testChild = testChild.parentNode;
	}

	return false;
}

export function findParentWithClass (node:HTMLElement, clazz:string, stopAtClazz?:string):HTMLElement {
	while (node) {
		if (hasClass(node, clazz)) {
			return node;
		}

		if (stopAtClazz && hasClass(node, stopAtClazz)) {
			return null;
		}

		node = <HTMLElement>node.parentNode;
	}

	return null;
}

export function createStyleSheet(): HTMLStyleElement {
	var style = document.createElement('style');
	style.type = 'text/css';
	style.media = 'screen';
	document.getElementsByTagName('head')[0].appendChild(style);
	return style;
}

var sharedStyle = <any>createStyleSheet();

function getDynamicStyleSheetRules(style:any) {
	if (style && style.sheet && style.sheet.rules) {
		// Chrome, IE
		return style.sheet.rules;
	}
	if (style && style.sheet && style.sheet.cssRules) {
		// FF
		return style.sheet.cssRules;
	}
	return [];
}

export function createCSSRule(selector:string, cssText:string, style:HTMLStyleElement=sharedStyle): void {
	if (!style || !cssText) {
		return;
	}

	(<any>style.sheet).insertRule(selector + '{' + cssText + '}', 0);
}

export function getCSSRule(selector:string, style:HTMLStyleElement=sharedStyle): any {
	if (!style) {
		return null;
	}

	var rules = getDynamicStyleSheetRules(style);
	for (var i = 0; i < rules.length; i++) {
		var rule = rules[i];
		var normalizedSelectorText = rule.selectorText.replace(/::/gi, ':');
		if (normalizedSelectorText === selector) {
			return rule;
		}
	}

	return null;
}

export function removeCSSRulesWithPrefix(ruleName:string, style=sharedStyle): void {
	if (!style) {
		return;
	}

	var rules = getDynamicStyleSheetRules(style);
	var toDelete: number[] = [];
	for (var i = 0; i < rules.length; i++) {
		var rule = rules[i];
		var normalizedSelectorText = rule.selectorText.replace(/::/gi, ':');
		if (normalizedSelectorText.indexOf(ruleName) === 0) {
			toDelete.push(i);
		}
	}

	for (var i = toDelete.length - 1; i >= 0; i--) {
		style.sheet.deleteRule(toDelete[i]);
	}
}

export function isHTMLElement(o:any): o is HTMLElement {
	return browserService.getService().isHTMLElement(o);
}

export var EventType = {
	// Mouse
	CLICK: 'click',
	DBLCLICK: 'dblclick',
	MOUSE_UP: 'mouseup',
	MOUSE_DOWN: 'mousedown',
	MOUSE_OVER: 'mouseover',
	MOUSE_MOVE: 'mousemove',
	MOUSE_OUT: 'mouseout',
	CONTEXT_MENU: 'contextmenu',
	// Keyboard
	KEY_DOWN: 'keydown',
	KEY_PRESS: 'keypress',
	KEY_UP: 'keyup',
	// HTML Document
	LOAD: 'load',
	UNLOAD: 'unload',
	ABORT: 'abort',
	ERROR: 'error',
	RESIZE: 'resize',
	SCROLL: 'scroll',
	// Form
	SELECT: 'select',
	CHANGE: 'change',
	SUBMIT: 'submit',
	RESET: 'reset',
	FOCUS: 'focus',
	BLUR: 'blur',
	INPUT: 'input',
	// Local Storage
	STORAGE: 'storage',
	// Drag
	DRAG_START: 'dragstart',
	DRAG: 'drag',
	DRAG_ENTER: 'dragenter',
	DRAG_LEAVE: 'dragleave',
	DRAG_OVER: 'dragover',
	DROP: 'drop',
	DRAG_END: 'dragend',
	// Animation
	ANIMATION_START: Browser.isWebKit ? 'webkitAnimationStart' : 'animationstart',
	ANIMATION_END: Browser.isWebKit ? 'webkitAnimationEnd' : 'animationend',
	ANIMATION_ITERATION: Browser.isWebKit ? 'webkitAnimationIteration' : 'animationiteration'
};

export var EventHelper = {
	stop: function (e:Event, cancelBubble?:boolean) {
		if (e.preventDefault) {
			e.preventDefault();
		} else {
			// IE8
			(<any>e).returnValue = false;
		}

		if (cancelBubble) {
			if (e.stopPropagation) {
				e.stopPropagation();
			} else {
				// IE8
				e.cancelBubble = true;
			}
		}
	}
};

export interface IFocusTracker {
	addBlurListener(fn):()=>void;
	addFocusListener(fn):()=>void;
	dispose():void;
}

export function selectTextInInputElement(textArea:HTMLTextAreaElement): void {
	// F12 has detected in their automated tests that selecting throws sometimes,
	// the root cause remains a mistery. Bug #378257 filled against IE.
	try {
		var scrollState:number[] = saveParentsScrollTop(textArea);
		textArea.select();
		if (textArea.setSelectionRange) {
			// on iOS Safari, .select() moves caret to the end of the text instead of selecting
			// see http://stackoverflow.com/questions/3272089/programmatically-selecting-text-in-an-input-field-on-ios-devices-mobile-safari
			textArea.setSelectionRange(0, 9999);
		}
		restoreParentsScrollTop(textArea, scrollState);
	} catch (e) {
		// no-op
	}
}

export function saveParentsScrollTop(node:Element): number[] {
	var r:number[] = [];
	for (var i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
		r[i] = node.scrollTop;
		node = <Element>node.parentNode;
	}
	return r;
}

export function restoreParentsScrollTop(node:Element, state:number[]): void {
	for (var i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
		if (node.scrollTop !== state[i]) {
			node.scrollTop = state[i];
		}
		node = <Element>node.parentNode;
	}
}

export function trackFocus(element:HTMLElement):IFocusTracker {

	var hasFocus:boolean = false, loosingFocus = false;
	var eventEmitter = new Emitter.EventEmitter(), unbind = [], result:IFocusTracker = null;

	// fill result
	result = {
		addFocusListener: function(fn) {
			var h = eventEmitter.addListener('focus', fn);
			unbind.push(h);
			return h;
		},
		addBlurListener: function(fn) {
			var h = eventEmitter.addListener('blur', fn);
			unbind.push(h);
			return h;
		},
		dispose: function() {
			while(unbind.length > 0) {
				unbind.pop()();
			}
		}
	};

	var onFocus = function(event) {
		loosingFocus = false;
		if(!hasFocus) {
			hasFocus = true;
			eventEmitter.emit('focus', {});
		}
	};

	var onBlur = function(event) {
		if(hasFocus) {
			loosingFocus = true;
			window.setTimeout(function() {
				if(loosingFocus) {
					loosingFocus = false;
					hasFocus = false;
					eventEmitter.emit('blur', {});
				}
			}, 0);
		}
	};

	// bind
	unbind.push(addListener(element, EventType.FOCUS, onFocus, true));
	unbind.push(addListener(element, EventType.BLUR, onBlur, true));

	return result;
}

export function removeScriptTags(html:string):string {
	var div = document.createElement('div');
	div.innerHTML = html;

	var scripts = div.getElementsByTagName('script');
	var i = scripts.length;

	while (i--) {
		scripts[i].parentNode.removeChild(scripts[i]);
	}

	return div.innerHTML;
};

export function append<T extends Node>(parent: HTMLElement, child: T): T {
	parent.appendChild(child);
	return child;
}

var SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((.([\w\-]+))*)/;

// Similar to builder, but much more lightweight
export function emmet(description: string):HTMLElement {
	var match = SELECTOR_REGEX.exec(description);

	if (!match) {
		throw new Error('Bad use of emmet');
	}

	var result = document.createElement(match[1] || 'div');
	match[3] && (result.id = match[3]);
	match[4] && (result.className = match[4].replace(/\./g, ' ').trim());

	return result;
};
