/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TimeoutTimer} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {Disposable, IDisposable} from 'vs/base/common/lifecycle';
import {isObject} from 'vs/base/common/types';
import {isChrome, isWebKit} from 'vs/base/browser/browser';
import {getService} from 'vs/base/browser/browserService';
import {IKeyboardEvent, StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent, StandardMouseEvent} from 'vs/base/browser/mouseEvent';

export function clearNode(node: HTMLElement) {
	while (node.firstChild) {
		node.removeChild(node.firstChild);
	}
}

/**
 * Calls JSON.Stringify with a replacer to break apart any circular references.
 * This prevents JSON.stringify from throwing the exception
 *  "Uncaught TypeError: Converting circular structure to JSON"
 */
export function safeStringifyDOMAware(obj: any): string {
	let seen: any[] = [];
	return JSON.stringify(obj, (key, value) => {

		// HTML elements are never going to serialize nicely
		if (value instanceof Element) {
			return '[Element]';
		}

		if (isObject(value) || Array.isArray(value)) {
			if (seen.indexOf(value) !== -1) {
				return '[Circular]';
			} else {
				seen.push(value);
			}
		}
		return value;
	});
}

export function isInDOM(node: Node): boolean {
	while (node) {
		if (node === document.body) {
			return true;
		}
		node = node.parentNode;
	}
	return false;
}

const _blank = ' '.charCodeAt(0);
let lastStart: number, lastEnd: number;

function _findClassName(node: HTMLElement, className: string): void {

	let classes = node.className;
	if (!classes) {
		lastStart = -1;
		return;
	}

	className = className.trim();

	let classesLen = classes.length,
		classLen = className.length;

	if (classLen === 0) {
		lastStart = -1;
		return;
	}

	if (classesLen < classLen) {
		lastStart = -1;
		return;
	}

	if (classes === className) {
		lastStart = 0;
		lastEnd = classesLen;
		return;
	}

	let idx = -1,
		idxEnd: number;

	while ((idx = classes.indexOf(className, idx + 1)) >= 0) {

		idxEnd = idx + classLen;

		// a class that is followed by another class
		if ((idx === 0 || classes.charCodeAt(idx - 1) === _blank) && classes.charCodeAt(idxEnd) === _blank) {
			lastStart = idx;
			lastEnd = idxEnd + 1;
			return;
		}

		// last class
		if (idx > 0 && classes.charCodeAt(idx - 1) === _blank && idxEnd === classesLen) {
			lastStart = idx - 1;
			lastEnd = idxEnd;
			return;
		}

		// equal - duplicate of cmp above
		if (idx === 0 && idxEnd === classesLen) {
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
export function hasClass(node: HTMLElement, className: string): boolean {
	_findClassName(node, className);
	return lastStart !== -1;
}

/**
 * Adds the provided className to the provided node. This is a no-op
 * if the class is already set.
 * @param node a dom node
 * @param className a class name
 */
export function addClass(node: HTMLElement, className: string): void {
	if (!node.className) { // doesn't have it for sure
		node.className = className;
	} else {
		_findClassName(node, className); // see if it's already there
		if (lastStart === -1) {
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
export function removeClass(node: HTMLElement, className: string): void {
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
export function toggleClass(node: HTMLElement, className: string, shouldHaveIt?: boolean): void {
	_findClassName(node, className);
	if (lastStart !== -1 && !shouldHaveIt) {
		removeClass(node, className);
	}
	if (lastStart === -1 && shouldHaveIt) {
		addClass(node, className);
	}
}

class DomListener extends Disposable {

	private _usedAddEventListener: boolean;
	private _wrapHandler: (e: any) => void;
	private _node: any;
	private _type: string;
	private _useCapture: boolean;

	constructor(node: Element|Window|Document, type: string, handler: (e: any) => void, useCapture?: boolean) {
		super();

		this._node = node;
		this._type = type;
		this._useCapture = (useCapture || false);

		this._wrapHandler = (e) => {
			e = e || window.event;
			handler(e);
		};

		if (typeof this._node.addEventListener === 'function') {
			this._usedAddEventListener = true;
			this._node.addEventListener(this._type, this._wrapHandler, this._useCapture);
		} else {
			this._usedAddEventListener = false;
			this._node.attachEvent('on' + this._type, this._wrapHandler);
		}
	}

	public dispose(): void {
		if (!this._wrapHandler) {
			// Already disposed
			return;
		}

		if (this._usedAddEventListener) {
			this._node.removeEventListener(this._type, this._wrapHandler, this._useCapture);
		} else {
			this._node.detachEvent('on' + this._type, this._wrapHandler);
		}

		// Prevent leakers from holding on to the dom or handler func
		this._node = null;
		this._wrapHandler = null;
	}
}

export function addDisposableListener(node: Element, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: Element|Window, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: Window, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: Document, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: any, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	return new DomListener(node, type, handler, useCapture);
}

export interface IAddStandardDisposableListenerSignature {
	(node: HTMLElement, type: 'click', handler: (event: IMouseEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keydown', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keypress', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keyup', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
}
function _wrapAsStandardMouseEvent(handler: (e: IMouseEvent) => void): (e: MouseEvent) => void {
	return function(e: MouseEvent) {
		return handler(new StandardMouseEvent(e));
	};
}
function _wrapAsStandardKeyboardEvent(handler: (e: IKeyboardEvent) => void): (e: KeyboardEvent) => void {
	return function(e: KeyboardEvent) {
		return handler(new StandardKeyboardEvent(e));
	};
}
export let addStandardDisposableListener: IAddStandardDisposableListenerSignature = function addStandardDisposableListener(node: HTMLElement, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	let wrapHandler = handler;

	if (type === 'click') {
		wrapHandler = _wrapAsStandardMouseEvent(handler);
	} else if (type === 'keydown' || type === 'keypress' || type === 'keyup') {
		wrapHandler = _wrapAsStandardKeyboardEvent(handler);
	}

	node.addEventListener(type, wrapHandler, useCapture || false);
	return {
		dispose: function() {
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

export function addDisposableNonBubblingMouseOutListener(node: Element, handler: (event: MouseEvent) => void): IDisposable {
	return addDisposableListener(node, 'mouseout', (e: MouseEvent) => {
		// Mouse out bubbles, so this is an attempt to ignore faux mouse outs coming from children elements
		let toElement = <Node>(e.relatedTarget || e.toElement);
		while (toElement && toElement !== node) {
			toElement = toElement.parentNode;
		}
		if (toElement === node) {
			return;
		}

		handler(e);
	});
}

const _animationFrame = (function() {
	let emulatedRequestAnimationFrame = (callback: (time: number) => void): number => {
		return setTimeout(() => callback(new Date().getTime()), 0);
	};
	let nativeRequestAnimationFrame: (callback: (time: number) => void) => number =
		self.requestAnimationFrame
		|| (<any>self).msRequestAnimationFrame
		|| (<any>self).webkitRequestAnimationFrame
		|| (<any>self).mozRequestAnimationFrame
		|| (<any>self).oRequestAnimationFrame;



	let emulatedCancelAnimationFrame = (id: number) => { };
	let nativeCancelAnimationFrame: (id: number) => void =
		self.cancelAnimationFrame || (<any>self).cancelRequestAnimationFrame
		|| (<any>self).msCancelAnimationFrame || (<any>self).msCancelRequestAnimationFrame
		|| (<any>self).webkitCancelAnimationFrame || (<any>self).webkitCancelRequestAnimationFrame
		|| (<any>self).mozCancelAnimationFrame || (<any>self).mozCancelRequestAnimationFrame
		|| (<any>self).oCancelAnimationFrame || (<any>self).oCancelRequestAnimationFrame;

	let isNative = !!nativeRequestAnimationFrame;
	let request = nativeRequestAnimationFrame || emulatedRequestAnimationFrame;
	let cancel = nativeCancelAnimationFrame || emulatedCancelAnimationFrame;

	return {
		isNative: isNative,
		request: (callback: (time: number) => void): number => {
			return request(callback);
		},
		cancel: (id: number) => {
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
export let runAtThisOrScheduleAtNextAnimationFrame: (runner: () => void, priority?: number) => IDisposable;
/**
 * Schedule a callback to be run at the next animation frame.
 * This allows multiple parties to register callbacks that should run at the next animation frame.
 * If currently in an animation frame, `runner` will be executed at the next animation frame.
 * @return token that can be used to cancel the scheduled runner.
 */
export let scheduleAtNextAnimationFrame: (runner: () => void, priority?: number) => IDisposable;

class AnimationFrameQueueItem implements IDisposable {

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
			onUnexpectedError(e);
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
	let NEXT_QUEUE: AnimationFrameQueueItem[] = [];
	/**
	 * The runners scheduled at the current animation frame
	 */
	let CURRENT_QUEUE: AnimationFrameQueueItem[] = null;
	/**
	 * A flag to keep track if the native requestAnimationFrame was already called
	 */
	let animFrameRequested = false;
	/**
	 * A flag to indicate if currently handling a native requestAnimationFrame callback
	 */
	let inAnimationFrameRunner = false;

	let animationFrameRunner = () => {
		animFrameRequested = false;

		CURRENT_QUEUE = NEXT_QUEUE;
		NEXT_QUEUE = [];

		inAnimationFrameRunner = true;
		while (CURRENT_QUEUE.length > 0) {
			CURRENT_QUEUE.sort(AnimationFrameQueueItem.sort);
			let top = CURRENT_QUEUE.shift();
			top.execute();
		}
		inAnimationFrameRunner = false;
	};

	scheduleAtNextAnimationFrame = (runner: () => void, priority: number = 0) => {
		let item = new AnimationFrameQueueItem(runner, priority);
		NEXT_QUEUE.push(item);

		if (!animFrameRequested) {
			animFrameRequested = true;

			// TODO@Alex: also check if it is electron
			if (isChrome) {
				let handle: number;
				_animationFrame.request(function() {
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

	runAtThisOrScheduleAtNextAnimationFrame = (runner: () => void, priority?: number) => {
		if (inAnimationFrameRunner) {
			let item = new AnimationFrameQueueItem(runner, priority);
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
	(lastEvent: R, currentEvent: Event): R;
}

const MINIMUM_TIME_MS = 16;
const DEFAULT_EVENT_MERGER: IEventMerger<Event> = function(lastEvent: Event, currentEvent: Event) {
	return currentEvent;
};

class TimeoutThrottledDomListener<R> extends Disposable {

	constructor(node: any, type: string, handler: (event: R) => void, eventMerger: IEventMerger<R> = <any>DEFAULT_EVENT_MERGER, minimumTimeMs: number = MINIMUM_TIME_MS) {
		super();

		let lastEvent = null;
		let lastHandlerTime = 0;
		let timeout = this._register(new TimeoutTimer());

		let invokeHandler = () => {
			lastHandlerTime = (new Date()).getTime();
			handler(lastEvent);
			lastEvent = null;
		};

		this._register(addDisposableListener(node, type, (e) => {

			lastEvent = eventMerger(lastEvent, e);
			let elapsedTime = (new Date()).getTime() - lastHandlerTime;

			if (elapsedTime >= minimumTimeMs) {
				timeout.cancel();
				invokeHandler();
			} else {
				timeout.setIfNotSet(invokeHandler, minimumTimeMs - elapsedTime);
			}
		}));
	}
}

export function addDisposableThrottledListener<R>(node: any, type: string, handler: (event: R) => void, eventMerger?: IEventMerger<R>, minimumTimeMs?: number): IDisposable {
	return new TimeoutThrottledDomListener<R>(node, type, handler, eventMerger, minimumTimeMs);
}

export function getComputedStyle(el: HTMLElement): CSSStyleDeclaration {
	return document.defaultView.getComputedStyle(el, null);
}

// Adapted from WinJS
// Converts a CSS positioning string for the specified element to pixels.
const convertToPixels: (element: HTMLElement, value: string) => number = (function() {
	return function(element: HTMLElement, value: string): number {
		return parseFloat(value) || 0;
	};
})();

function getDimension(element: HTMLElement, cssPropertyName: string, jsPropertyName: string): number {
	let computedStyle: CSSStyleDeclaration = getComputedStyle(element);
	let value = '0';
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

const sizeUtils = {

	getBorderLeftWidth: function(element: HTMLElement): number {
		return getDimension(element, 'border-left-width', 'borderLeftWidth');
	},
	getBorderTopWidth: function(element: HTMLElement): number {
		return getDimension(element, 'border-top-width', 'borderTopWidth');
	},
	getBorderRightWidth: function(element: HTMLElement): number {
		return getDimension(element, 'border-right-width', 'borderRightWidth');
	},
	getBorderBottomWidth: function(element: HTMLElement): number {
		return getDimension(element, 'border-bottom-width', 'borderBottomWidth');
	},

	getPaddingLeft: function(element: HTMLElement): number {
		return getDimension(element, 'padding-left', 'paddingLeft');
	},
	getPaddingTop: function(element: HTMLElement): number {
		return getDimension(element, 'padding-top', 'paddingTop');
	},
	getPaddingRight: function(element: HTMLElement): number {
		return getDimension(element, 'padding-right', 'paddingRight');
	},
	getPaddingBottom: function(element: HTMLElement): number {
		return getDimension(element, 'padding-bottom', 'paddingBottom');
	},

	getMarginLeft: function(element: HTMLElement): number {
		return getDimension(element, 'margin-left', 'marginLeft');
	},
	getMarginTop: function(element: HTMLElement): number {
		return getDimension(element, 'margin-top', 'marginTop');
	},
	getMarginRight: function(element: HTMLElement): number {
		return getDimension(element, 'margin-right', 'marginRight');
	},
	getMarginBottom: function(element: HTMLElement): number {
		return getDimension(element, 'margin-bottom', 'marginBottom');
	},
	__commaSentinel: false
};

// ----------------------------------------------------------------------------------------
// Position & Dimension

export function getTopLeftOffset(element: HTMLElement): { left: number; top: number; } {
	// Adapted from WinJS.Utilities.getPosition
	// and added borders to the mix

	let offsetParent = element.offsetParent, top = element.offsetTop, left = element.offsetLeft;

	while ((element = <HTMLElement>element.parentNode) !== null && element !== document.body && element !== document.documentElement) {
		top -= element.scrollTop;
		let c = getComputedStyle(element);
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
	left: number;
	top: number;
	width: number;
	height: number;
}

export function getDomNodePosition(domNode: HTMLElement): IDomNodePosition {
	let r = getTopLeftOffset(domNode);
	return {
		left: r.left,
		top: r.top,
		width: domNode.clientWidth,
		height: domNode.clientHeight
	};
}

// Adapted from WinJS
// Gets the width of the content of the specified element. The content width does not include borders or padding.
export function getContentWidth(element: HTMLElement): number {
	let border = sizeUtils.getBorderLeftWidth(element) + sizeUtils.getBorderRightWidth(element);
	let padding = sizeUtils.getPaddingLeft(element) + sizeUtils.getPaddingRight(element);
	return element.offsetWidth - border - padding;
}

// Adapted from WinJS
// Gets the width of the element, including margins.
export function getTotalWidth(element: HTMLElement): number {
	let margin = sizeUtils.getMarginLeft(element) + sizeUtils.getMarginRight(element);
	return element.offsetWidth + margin;
}

// Adapted from WinJS
// Gets the height of the content of the specified element. The content height does not include borders or padding.
export function getContentHeight(element: HTMLElement): number {
	let border = sizeUtils.getBorderTopWidth(element) + sizeUtils.getBorderBottomWidth(element);
	let padding = sizeUtils.getPaddingTop(element) + sizeUtils.getPaddingBottom(element);
	return element.offsetHeight - border - padding;
}

// Adapted from WinJS
// Gets the height of the element, including its margins.
export function getTotalHeight(element: HTMLElement): number {
	let margin = sizeUtils.getMarginTop(element) + sizeUtils.getMarginBottom(element);
	return element.offsetHeight + margin;
}

// Adapted from WinJS
// Gets the left coordinate of the specified element relative to the specified parent.
export function getRelativeLeft(element: HTMLElement, parent: HTMLElement): number {
	if (element === null) {
		return 0;
	}

	let left = element.offsetLeft;
	let e = <HTMLElement>element.parentNode;
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
export function getRelativeTop(element: HTMLElement, parent: HTMLElement): number {
	if (element === null) {
		return 0;
	}

	let top = element.offsetTop;
	let e = <HTMLElement>element.parentNode;
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

export function isAncestor(testChild: Node, testAncestor: Node): boolean {
	while (testChild) {
		if (testChild === testAncestor) {
			return true;
		}
		testChild = testChild.parentNode;
	}

	return false;
}

export function findParentWithClass(node: HTMLElement, clazz: string, stopAtClazz?: string): HTMLElement {
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
	let style = document.createElement('style');
	style.type = 'text/css';
	style.media = 'screen';
	document.getElementsByTagName('head')[0].appendChild(style);
	return style;
}

const sharedStyle = <any>createStyleSheet();

function getDynamicStyleSheetRules(style: any) {
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

export function createCSSRule(selector: string, cssText: string, style: HTMLStyleElement = sharedStyle): void {
	if (!style || !cssText) {
		return;
	}

	(<any>style.sheet).insertRule(selector + '{' + cssText + '}', 0);
}

export function getCSSRule(selector: string, style: HTMLStyleElement = sharedStyle): any {
	if (!style) {
		return null;
	}

	let rules = getDynamicStyleSheetRules(style);
	for (let i = 0; i < rules.length; i++) {
		let rule = rules[i];
		let normalizedSelectorText = rule.selectorText.replace(/::/gi, ':');
		if (normalizedSelectorText === selector) {
			return rule;
		}
	}

	return null;
}

export function removeCSSRulesWithPrefix(ruleName: string, style = sharedStyle): void {
	if (!style) {
		return;
	}

	let rules = getDynamicStyleSheetRules(style);
	let toDelete: number[] = [];
	for (let i = 0; i < rules.length; i++) {
		let rule = rules[i];
		let normalizedSelectorText = rule.selectorText.replace(/::/gi, ':');
		if (normalizedSelectorText.indexOf(ruleName) === 0) {
			toDelete.push(i);
		}
	}

	for (let i = toDelete.length - 1; i >= 0; i--) {
		style.sheet.deleteRule(toDelete[i]);
	}
}

export function isHTMLElement(o: any): o is HTMLElement {
	return getService().isHTMLElement(o);
}

export const EventType = {
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
	ANIMATION_START: isWebKit ? 'webkitAnimationStart' : 'animationstart',
	ANIMATION_END: isWebKit ? 'webkitAnimationEnd' : 'animationend',
	ANIMATION_ITERATION: isWebKit ? 'webkitAnimationIteration' : 'animationiteration'
};

export interface EventLike {
	preventDefault(): void;
	stopPropagation(): void;
}

export const EventHelper = {
	stop: function(e: EventLike, cancelBubble?: boolean) {
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
				(<any>e).cancelBubble = true;
			}
		}
	}
};

export interface IFocusTracker {
	addBlurListener(fn:()=>void): IDisposable;
	addFocusListener(fn:()=>void): IDisposable;
	dispose(): void;
}

export function saveParentsScrollTop(node: Element): number[] {
	let r: number[] = [];
	for (let i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
		r[i] = node.scrollTop;
		node = <Element>node.parentNode;
	}
	return r;
}

export function restoreParentsScrollTop(node: Element, state: number[]): void {
	for (let i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
		if (node.scrollTop !== state[i]) {
			node.scrollTop = state[i];
		}
		node = <Element>node.parentNode;
	}
}

class FocusTracker extends Disposable implements IFocusTracker {

	private _eventEmitter: EventEmitter;

	constructor(element: HTMLElement|Window) {
		super();

		let hasFocus = false;
		let loosingFocus = false;

		this._eventEmitter = this._register(new EventEmitter());

		let onFocus = (event) => {
			loosingFocus = false;
			if (!hasFocus) {
				hasFocus = true;
				this._eventEmitter.emit('focus', {});
			}
		};

		let onBlur = (event) => {
			if (hasFocus) {
				loosingFocus = true;
				window.setTimeout(() => {
					if (loosingFocus) {
						loosingFocus = false;
						hasFocus = false;
						this._eventEmitter.emit('blur', {});
					}
				}, 0);
			}
		};

		this._register(addDisposableListener(element, EventType.FOCUS, onFocus, true));
		this._register(addDisposableListener(element, EventType.BLUR, onBlur, true));
	}

	public addFocusListener(fn:()=>void): IDisposable {
		return this._eventEmitter.addListener2('focus', fn);
	}

	public addBlurListener(fn:()=>void): IDisposable {
		return this._eventEmitter.addListener2('blur', fn);
	}
}

export function trackFocus(element: HTMLElement|Window): IFocusTracker {
	return new FocusTracker(element);
}

export function append<T extends Node>(parent: HTMLElement, child: T): T {
	parent.appendChild(child);
	return child;
}

const SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((.([\w\-]+))*)/;

// Similar to builder, but much more lightweight
export function emmet(description: string): HTMLElement {
	let match = SELECTOR_REGEX.exec(description);

	if (!match) {
		throw new Error('Bad use of emmet');
	}

	let result = document.createElement(match[1] || 'div');
	if (match[3]) {
		result.id = match[3];
	}
	if (match[4]) {
		result.className = match[4].replace(/\./g, ' ').trim();
	}

	return result;
}

export function show(...elements: HTMLElement[]): void {
	for (const element of elements) {
		element.style.display = null;
	}
}

export function hide(...elements: HTMLElement[]): void {
	for (const element of elements) {
		element.style.display = 'none';
	}
}

function findParentWithAttribute(node: Node, attribute: string): HTMLElement {
	while (node) {
		if (node instanceof HTMLElement && node.hasAttribute(attribute)) {
			return node;
		}

		node = node.parentNode;
	}

	return null;
}

export function removeTabIndexAndUpdateFocus(node: HTMLElement): void {
	if (!node || !node.hasAttribute('tabIndex')) {
		return;
	}

	// If we are the currently focused element and tabIndex is removed,
	// standard DOM behavior is to move focus to the <body> element. We
	// typically never want that, rather put focus to the closest element
	// in the hierarchy of the parent DOM nodes.
	if (document.activeElement === node) {
		let parentFocusable = findParentWithAttribute(node.parentElement, 'tabIndex');
		if (parentFocusable) {
			parentFocusable.focus();
		}
	}

	node.removeAttribute('tabindex');
}
