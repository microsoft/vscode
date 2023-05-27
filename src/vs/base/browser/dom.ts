/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { TimeoutTimer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as event from 'vs/base/common/event';
import * as dompurify from 'vs/base/browser/dompurify/dompurify';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { FileAccess, RemoteAuthorities, Schemas } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';

export function clearNode(node: HTMLElement): void {
	while (node.firstChild) {
		node.firstChild.remove();
	}
}

/**
 * @deprecated Use node.isConnected directly
 */
export function isInDOM(node: Node | null): boolean {
	return node?.isConnected ?? false;
}

class DomListener implements IDisposable {

	private _handler: (e: any) => void;
	private _node: EventTarget;
	private readonly _type: string;
	private readonly _options: boolean | AddEventListenerOptions;

	constructor(node: EventTarget, type: string, handler: (e: any) => void, options?: boolean | AddEventListenerOptions) {
		this._node = node;
		this._type = type;
		this._handler = handler;
		this._options = (options || false);
		this._node.addEventListener(this._type, this._handler, this._options);
	}

	public dispose(): void {
		if (!this._handler) {
			// Already disposed
			return;
		}

		this._node.removeEventListener(this._type, this._handler, this._options);

		// Prevent leakers from holding on to the dom or handler func
		this._node = null!;
		this._handler = null!;
	}
}

export function addDisposableListener<K extends keyof GlobalEventHandlersEventMap>(node: EventTarget, type: K, handler: (event: GlobalEventHandlersEventMap[K]) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, options: AddEventListenerOptions): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, useCaptureOrOptions?: boolean | AddEventListenerOptions): IDisposable {
	return new DomListener(node, type, handler, useCaptureOrOptions);
}

export interface IAddStandardDisposableListenerSignature {
	(node: HTMLElement, type: 'click', handler: (event: IMouseEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'mousedown', handler: (event: IMouseEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keydown', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keypress', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'keyup', handler: (event: IKeyboardEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'pointerdown', handler: (event: PointerEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'pointermove', handler: (event: PointerEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: 'pointerup', handler: (event: PointerEvent) => void, useCapture?: boolean): IDisposable;
	(node: HTMLElement, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
}
function _wrapAsStandardMouseEvent(handler: (e: IMouseEvent) => void): (e: MouseEvent) => void {
	return function (e: MouseEvent) {
		return handler(new StandardMouseEvent(e));
	};
}
function _wrapAsStandardKeyboardEvent(handler: (e: IKeyboardEvent) => void): (e: KeyboardEvent) => void {
	return function (e: KeyboardEvent) {
		return handler(new StandardKeyboardEvent(e));
	};
}
export const addStandardDisposableListener: IAddStandardDisposableListenerSignature = function addStandardDisposableListener(node: HTMLElement, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	let wrapHandler = handler;

	if (type === 'click' || type === 'mousedown') {
		wrapHandler = _wrapAsStandardMouseEvent(handler);
	} else if (type === 'keydown' || type === 'keypress' || type === 'keyup') {
		wrapHandler = _wrapAsStandardKeyboardEvent(handler);
	}

	return addDisposableListener(node, type, wrapHandler, useCapture);
};

export const addStandardDisposableGenericMouseDownListener = function addStandardDisposableListener(node: HTMLElement, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	const wrapHandler = _wrapAsStandardMouseEvent(handler);

	return addDisposableGenericMouseDownListener(node, wrapHandler, useCapture);
};

export const addStandardDisposableGenericMouseUpListener = function addStandardDisposableListener(node: HTMLElement, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	const wrapHandler = _wrapAsStandardMouseEvent(handler);

	return addDisposableGenericMouseUpListener(node, wrapHandler, useCapture);
};
export function addDisposableGenericMouseDownListener(node: EventTarget, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_DOWN : EventType.MOUSE_DOWN, handler, useCapture);
}

export function addDisposableGenericMouseMoveListener(node: EventTarget, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_MOVE : EventType.MOUSE_MOVE, handler, useCapture);
}

export function addDisposableGenericMouseUpListener(node: EventTarget, handler: (event: any) => void, useCapture?: boolean): IDisposable {
	return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_UP : EventType.MOUSE_UP, handler, useCapture);
}

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

	constructor(runner: () => void, priority: number = 0) {
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

(function () {
	/**
	 * The runners scheduled at the next animation frame
	 */
	let NEXT_QUEUE: AnimationFrameQueueItem[] = [];
	/**
	 * The runners scheduled at the current animation frame
	 */
	let CURRENT_QUEUE: AnimationFrameQueueItem[] | null = null;
	/**
	 * A flag to keep track if the native requestAnimationFrame was already called
	 */
	let animFrameRequested = false;
	/**
	 * A flag to indicate if currently handling a native requestAnimationFrame callback
	 */
	let inAnimationFrameRunner = false;

	const animationFrameRunner = () => {
		animFrameRequested = false;

		CURRENT_QUEUE = NEXT_QUEUE;
		NEXT_QUEUE = [];

		inAnimationFrameRunner = true;
		while (CURRENT_QUEUE.length > 0) {
			CURRENT_QUEUE.sort(AnimationFrameQueueItem.sort);
			const top = CURRENT_QUEUE.shift()!;
			top.execute();
		}
		inAnimationFrameRunner = false;
	};

	scheduleAtNextAnimationFrame = (runner: () => void, priority: number = 0) => {
		const item = new AnimationFrameQueueItem(runner, priority);
		NEXT_QUEUE.push(item);

		if (!animFrameRequested) {
			animFrameRequested = true;
			requestAnimationFrame(animationFrameRunner);
		}

		return item;
	};

	runAtThisOrScheduleAtNextAnimationFrame = (runner: () => void, priority?: number) => {
		if (inAnimationFrameRunner) {
			const item = new AnimationFrameQueueItem(runner, priority);
			CURRENT_QUEUE!.push(item);
			return item;
		} else {
			return scheduleAtNextAnimationFrame(runner, priority);
		}
	};
})();

export function measure(callback: () => void): IDisposable {
	return scheduleAtNextAnimationFrame(callback, 10000 /* must be early */);
}

export function modify(callback: () => void): IDisposable {
	return scheduleAtNextAnimationFrame(callback, -10000 /* must be late */);
}

/**
 * Add a throttled listener. `handler` is fired at most every 8.33333ms or with the next animation frame (if browser supports it).
 */
export interface IEventMerger<R, E> {
	(lastEvent: R | null, currentEvent: E): R;
}

const MINIMUM_TIME_MS = 8;
const DEFAULT_EVENT_MERGER: IEventMerger<Event, Event> = function (lastEvent: Event | null, currentEvent: Event) {
	return currentEvent;
};

class TimeoutThrottledDomListener<R, E extends Event> extends Disposable {

	constructor(node: any, type: string, handler: (event: R) => void, eventMerger: IEventMerger<R, E> = <any>DEFAULT_EVENT_MERGER, minimumTimeMs: number = MINIMUM_TIME_MS) {
		super();

		let lastEvent: R | null = null;
		let lastHandlerTime = 0;
		const timeout = this._register(new TimeoutTimer());

		const invokeHandler = () => {
			lastHandlerTime = (new Date()).getTime();
			handler(<R>lastEvent);
			lastEvent = null;
		};

		this._register(addDisposableListener(node, type, (e) => {

			lastEvent = eventMerger(lastEvent, e);
			const elapsedTime = (new Date()).getTime() - lastHandlerTime;

			if (elapsedTime >= minimumTimeMs) {
				timeout.cancel();
				invokeHandler();
			} else {
				timeout.setIfNotSet(invokeHandler, minimumTimeMs - elapsedTime);
			}
		}));
	}
}

export function addDisposableThrottledListener<R, E extends Event = Event>(node: any, type: string, handler: (event: R) => void, eventMerger?: IEventMerger<R, E>, minimumTimeMs?: number): IDisposable {
	return new TimeoutThrottledDomListener<R, E>(node, type, handler, eventMerger, minimumTimeMs);
}

export function getComputedStyle(el: HTMLElement): CSSStyleDeclaration {
	return document.defaultView!.getComputedStyle(el, null);
}

export function getClientArea(element: HTMLElement): Dimension {

	// Try with DOM clientWidth / clientHeight
	if (element !== document.body) {
		return new Dimension(element.clientWidth, element.clientHeight);
	}

	// If visual view port exits and it's on mobile, it should be used instead of window innerWidth / innerHeight, or document.body.clientWidth / document.body.clientHeight
	if (platform.isIOS && window.visualViewport) {
		return new Dimension(window.visualViewport.width, window.visualViewport.height);
	}

	// Try innerWidth / innerHeight
	if (window.innerWidth && window.innerHeight) {
		return new Dimension(window.innerWidth, window.innerHeight);
	}

	// Try with document.body.clientWidth / document.body.clientHeight
	if (document.body && document.body.clientWidth && document.body.clientHeight) {
		return new Dimension(document.body.clientWidth, document.body.clientHeight);
	}

	// Try with document.documentElement.clientWidth / document.documentElement.clientHeight
	if (document.documentElement && document.documentElement.clientWidth && document.documentElement.clientHeight) {
		return new Dimension(document.documentElement.clientWidth, document.documentElement.clientHeight);
	}

	throw new Error('Unable to figure out browser width and height');
}

class SizeUtils {
	// Adapted from WinJS
	// Converts a CSS positioning string for the specified element to pixels.
	private static convertToPixels(element: HTMLElement, value: string): number {
		return parseFloat(value) || 0;
	}

	private static getDimension(element: HTMLElement, cssPropertyName: string, jsPropertyName: string): number {
		const computedStyle = getComputedStyle(element);
		const value = computedStyle ? computedStyle.getPropertyValue(cssPropertyName) : '0';
		return SizeUtils.convertToPixels(element, value);
	}

	static getBorderLeftWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-left-width', 'borderLeftWidth');
	}
	static getBorderRightWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-right-width', 'borderRightWidth');
	}
	static getBorderTopWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-top-width', 'borderTopWidth');
	}
	static getBorderBottomWidth(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'border-bottom-width', 'borderBottomWidth');
	}

	static getPaddingLeft(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-left', 'paddingLeft');
	}
	static getPaddingRight(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-right', 'paddingRight');
	}
	static getPaddingTop(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-top', 'paddingTop');
	}
	static getPaddingBottom(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'padding-bottom', 'paddingBottom');
	}

	static getMarginLeft(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-left', 'marginLeft');
	}
	static getMarginTop(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-top', 'marginTop');
	}
	static getMarginRight(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-right', 'marginRight');
	}
	static getMarginBottom(element: HTMLElement): number {
		return SizeUtils.getDimension(element, 'margin-bottom', 'marginBottom');
	}
}

// ----------------------------------------------------------------------------------------
// Position & Dimension

export interface IDimension {
	readonly width: number;
	readonly height: number;
}

export class Dimension implements IDimension {

	static readonly None = new Dimension(0, 0);

	constructor(
		public readonly width: number,
		public readonly height: number,
	) { }

	with(width: number = this.width, height: number = this.height): Dimension {
		if (width !== this.width || height !== this.height) {
			return new Dimension(width, height);
		} else {
			return this;
		}
	}

	static is(obj: unknown): obj is IDimension {
		return typeof obj === 'object' && typeof (<IDimension>obj).height === 'number' && typeof (<IDimension>obj).width === 'number';
	}

	static lift(obj: IDimension): Dimension {
		if (obj instanceof Dimension) {
			return obj;
		} else {
			return new Dimension(obj.width, obj.height);
		}
	}

	static equals(a: Dimension | undefined, b: Dimension | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.width === b.width && a.height === b.height;
	}
}

export interface IDomPosition {
	readonly left: number;
	readonly top: number;
}

export function getTopLeftOffset(element: HTMLElement): IDomPosition {
	// Adapted from WinJS.Utilities.getPosition
	// and added borders to the mix

	let offsetParent = element.offsetParent;
	let top = element.offsetTop;
	let left = element.offsetLeft;

	while (
		(element = <HTMLElement>element.parentNode) !== null
		&& element !== document.body
		&& element !== document.documentElement
	) {
		top -= element.scrollTop;
		const c = isShadowRoot(element) ? null : getComputedStyle(element);
		if (c) {
			left -= c.direction !== 'rtl' ? element.scrollLeft : -element.scrollLeft;
		}

		if (element === offsetParent) {
			left += SizeUtils.getBorderLeftWidth(element);
			top += SizeUtils.getBorderTopWidth(element);
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

export interface IDomNodePagePosition {
	left: number;
	top: number;
	width: number;
	height: number;
}

export function size(element: HTMLElement, width: number | null, height: number | null): void {
	if (typeof width === 'number') {
		element.style.width = `${width}px`;
	}

	if (typeof height === 'number') {
		element.style.height = `${height}px`;
	}
}

export function position(element: HTMLElement, top: number, right?: number, bottom?: number, left?: number, position: string = 'absolute'): void {
	if (typeof top === 'number') {
		element.style.top = `${top}px`;
	}

	if (typeof right === 'number') {
		element.style.right = `${right}px`;
	}

	if (typeof bottom === 'number') {
		element.style.bottom = `${bottom}px`;
	}

	if (typeof left === 'number') {
		element.style.left = `${left}px`;
	}

	element.style.position = position;
}

/**
 * Returns the position of a dom node relative to the entire page.
 */
export function getDomNodePagePosition(domNode: HTMLElement): IDomNodePagePosition {
	const bb = domNode.getBoundingClientRect();
	return {
		left: bb.left + window.scrollX,
		top: bb.top + window.scrollY,
		width: bb.width,
		height: bb.height
	};
}

/**
 * Returns the effective zoom on a given element before window zoom level is applied
 */
export function getDomNodeZoomLevel(domNode: HTMLElement): number {
	let testElement: HTMLElement | null = domNode;
	let zoom = 1.0;
	do {
		const elementZoomLevel = (getComputedStyle(testElement) as any).zoom;
		if (elementZoomLevel !== null && elementZoomLevel !== undefined && elementZoomLevel !== '1') {
			zoom *= elementZoomLevel;
		}

		testElement = testElement.parentElement;
	} while (testElement !== null && testElement !== document.documentElement);

	return zoom;
}


// Adapted from WinJS
// Gets the width of the element, including margins.
export function getTotalWidth(element: HTMLElement): number {
	const margin = SizeUtils.getMarginLeft(element) + SizeUtils.getMarginRight(element);
	return element.offsetWidth + margin;
}

export function getContentWidth(element: HTMLElement): number {
	const border = SizeUtils.getBorderLeftWidth(element) + SizeUtils.getBorderRightWidth(element);
	const padding = SizeUtils.getPaddingLeft(element) + SizeUtils.getPaddingRight(element);
	return element.offsetWidth - border - padding;
}

export function getTotalScrollWidth(element: HTMLElement): number {
	const margin = SizeUtils.getMarginLeft(element) + SizeUtils.getMarginRight(element);
	return element.scrollWidth + margin;
}

// Adapted from WinJS
// Gets the height of the content of the specified element. The content height does not include borders or padding.
export function getContentHeight(element: HTMLElement): number {
	const border = SizeUtils.getBorderTopWidth(element) + SizeUtils.getBorderBottomWidth(element);
	const padding = SizeUtils.getPaddingTop(element) + SizeUtils.getPaddingBottom(element);
	return element.offsetHeight - border - padding;
}

// Adapted from WinJS
// Gets the height of the element, including its margins.
export function getTotalHeight(element: HTMLElement): number {
	const margin = SizeUtils.getMarginTop(element) + SizeUtils.getMarginBottom(element);
	return element.offsetHeight + margin;
}

// Gets the left coordinate of the specified element relative to the specified parent.
function getRelativeLeft(element: HTMLElement, parent: HTMLElement): number {
	if (element === null) {
		return 0;
	}

	const elementPosition = getTopLeftOffset(element);
	const parentPosition = getTopLeftOffset(parent);
	return elementPosition.left - parentPosition.left;
}

export function getLargestChildWidth(parent: HTMLElement, children: HTMLElement[]): number {
	const childWidths = children.map((child) => {
		return Math.max(getTotalScrollWidth(child), getTotalWidth(child)) + getRelativeLeft(child, parent) || 0;
	});
	const maxWidth = Math.max(...childWidths);
	return maxWidth;
}

// ----------------------------------------------------------------------------------------

export function isAncestor(testChild: Node | null, testAncestor: Node | null): boolean {
	while (testChild) {
		if (testChild === testAncestor) {
			return true;
		}
		testChild = testChild.parentNode;
	}

	return false;
}

const parentFlowToDataKey = 'parentFlowToElementId';

/**
 * Set an explicit parent to use for nodes that are not part of the
 * regular dom structure.
 */
export function setParentFlowTo(fromChildElement: HTMLElement, toParentElement: Element): void {
	fromChildElement.dataset[parentFlowToDataKey] = toParentElement.id;
}

function getParentFlowToElement(node: HTMLElement): HTMLElement | null {
	const flowToParentId = node.dataset[parentFlowToDataKey];
	if (typeof flowToParentId === 'string') {
		return document.getElementById(flowToParentId);
	}
	return null;
}

/**
 * Check if `testAncestor` is an ancestor of `testChild`, observing the explicit
 * parents set by `setParentFlowTo`.
 */
export function isAncestorUsingFlowTo(testChild: Node, testAncestor: Node): boolean {
	let node: Node | null = testChild;
	while (node) {
		if (node === testAncestor) {
			return true;
		}

		if (node instanceof HTMLElement) {
			const flowToParentElement = getParentFlowToElement(node);
			if (flowToParentElement) {
				node = flowToParentElement;
				continue;
			}
		}
		node = node.parentNode;
	}

	return false;
}

export function findParentWithClass(node: HTMLElement, clazz: string, stopAtClazzOrNode?: string | HTMLElement): HTMLElement | null {
	while (node && node.nodeType === node.ELEMENT_NODE) {
		if (node.classList.contains(clazz)) {
			return node;
		}

		if (stopAtClazzOrNode) {
			if (typeof stopAtClazzOrNode === 'string') {
				if (node.classList.contains(stopAtClazzOrNode)) {
					return null;
				}
			} else {
				if (node === stopAtClazzOrNode) {
					return null;
				}
			}
		}

		node = <HTMLElement>node.parentNode;
	}

	return null;
}

export function hasParentWithClass(node: HTMLElement, clazz: string, stopAtClazzOrNode?: string | HTMLElement): boolean {
	return !!findParentWithClass(node, clazz, stopAtClazzOrNode);
}

export function isShadowRoot(node: Node): node is ShadowRoot {
	return (
		node && !!(<ShadowRoot>node).host && !!(<ShadowRoot>node).mode
	);
}

export function isInShadowDOM(domNode: Node): boolean {
	return !!getShadowRoot(domNode);
}

export function getShadowRoot(domNode: Node): ShadowRoot | null {
	while (domNode.parentNode) {
		if (domNode === document.body) {
			// reached the body
			return null;
		}
		domNode = domNode.parentNode;
	}
	return isShadowRoot(domNode) ? domNode : null;
}

export function getActiveElement(): Element | null {
	let result = document.activeElement;

	while (result?.shadowRoot) {
		result = result.shadowRoot.activeElement;
	}

	return result;
}

export function createStyleSheet(container: HTMLElement = document.getElementsByTagName('head')[0], beforeAppend?: (style: HTMLStyleElement) => void): HTMLStyleElement {
	const style = document.createElement('style');
	style.type = 'text/css';
	style.media = 'screen';
	beforeAppend?.(style);
	container.appendChild(style);
	return style;
}

export function createMetaElement(container: HTMLElement = document.getElementsByTagName('head')[0]): HTMLMetaElement {
	const meta = document.createElement('meta');
	container.appendChild(meta);
	return meta;
}

let _sharedStyleSheet: HTMLStyleElement | null = null;
function getSharedStyleSheet(): HTMLStyleElement {
	if (!_sharedStyleSheet) {
		_sharedStyleSheet = createStyleSheet();
	}
	return _sharedStyleSheet;
}

function getDynamicStyleSheetRules(style: any) {
	if (style?.sheet?.rules) {
		// Chrome, IE
		return style.sheet.rules;
	}
	if (style?.sheet?.cssRules) {
		// FF
		return style.sheet.cssRules;
	}
	return [];
}

export function createCSSRule(selector: string, cssText: string, style: HTMLStyleElement = getSharedStyleSheet()): void {
	if (!style || !cssText) {
		return;
	}

	(<CSSStyleSheet>style.sheet).insertRule(selector + '{' + cssText + '}', 0);
}

export function removeCSSRulesContainingSelector(ruleName: string, style: HTMLStyleElement = getSharedStyleSheet()): void {
	if (!style) {
		return;
	}

	const rules = getDynamicStyleSheetRules(style);
	const toDelete: number[] = [];
	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i];
		if (rule.selectorText.indexOf(ruleName) !== -1) {
			toDelete.push(i);
		}
	}

	for (let i = toDelete.length - 1; i >= 0; i--) {
		(<any>style.sheet).deleteRule(toDelete[i]);
	}
}

export function isHTMLElement(o: any): o is HTMLElement {
	if (typeof HTMLElement === 'object') {
		return o instanceof HTMLElement;
	}
	return o && typeof o === 'object' && o.nodeType === 1 && typeof o.nodeName === 'string';
}

export const EventType = {
	// Mouse
	CLICK: 'click',
	AUXCLICK: 'auxclick',
	DBLCLICK: 'dblclick',
	MOUSE_UP: 'mouseup',
	MOUSE_DOWN: 'mousedown',
	MOUSE_OVER: 'mouseover',
	MOUSE_MOVE: 'mousemove',
	MOUSE_OUT: 'mouseout',
	MOUSE_ENTER: 'mouseenter',
	MOUSE_LEAVE: 'mouseleave',
	MOUSE_WHEEL: 'wheel',
	POINTER_UP: 'pointerup',
	POINTER_DOWN: 'pointerdown',
	POINTER_MOVE: 'pointermove',
	POINTER_LEAVE: 'pointerleave',
	CONTEXT_MENU: 'contextmenu',
	WHEEL: 'wheel',
	// Keyboard
	KEY_DOWN: 'keydown',
	KEY_PRESS: 'keypress',
	KEY_UP: 'keyup',
	// HTML Document
	LOAD: 'load',
	BEFORE_UNLOAD: 'beforeunload',
	UNLOAD: 'unload',
	PAGE_SHOW: 'pageshow',
	PAGE_HIDE: 'pagehide',
	ABORT: 'abort',
	ERROR: 'error',
	RESIZE: 'resize',
	SCROLL: 'scroll',
	FULLSCREEN_CHANGE: 'fullscreenchange',
	WK_FULLSCREEN_CHANGE: 'webkitfullscreenchange',
	// Form
	SELECT: 'select',
	CHANGE: 'change',
	SUBMIT: 'submit',
	RESET: 'reset',
	FOCUS: 'focus',
	FOCUS_IN: 'focusin',
	FOCUS_OUT: 'focusout',
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
	ANIMATION_START: browser.isWebKit ? 'webkitAnimationStart' : 'animationstart',
	ANIMATION_END: browser.isWebKit ? 'webkitAnimationEnd' : 'animationend',
	ANIMATION_ITERATION: browser.isWebKit ? 'webkitAnimationIteration' : 'animationiteration'
} as const;

export interface EventLike {
	preventDefault(): void;
	stopPropagation(): void;
}

export function isEventLike(obj: unknown): obj is EventLike {
	const candidate = obj as EventLike | undefined;

	return !!(candidate && typeof candidate.preventDefault === 'function' && typeof candidate.stopPropagation === 'function');
}

export const EventHelper = {
	stop: <T extends EventLike>(e: T, cancelBubble?: boolean): T => {
		e.preventDefault();
		if (cancelBubble) {
			e.stopPropagation();
		}
		return e;
	}
};

export interface IFocusTracker extends Disposable {
	onDidFocus: event.Event<void>;
	onDidBlur: event.Event<void>;
	refreshState(): void;
}

export function saveParentsScrollTop(node: Element): number[] {
	const r: number[] = [];
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

	private readonly _onDidFocus = this._register(new event.Emitter<void>());
	public readonly onDidFocus: event.Event<void> = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new event.Emitter<void>());
	public readonly onDidBlur: event.Event<void> = this._onDidBlur.event;

	private _refreshStateHandler: () => void;

	private static hasFocusWithin(element: HTMLElement): boolean {
		const shadowRoot = getShadowRoot(element);
		const activeElement = (shadowRoot ? shadowRoot.activeElement : document.activeElement);
		return isAncestor(activeElement, element);
	}

	constructor(element: HTMLElement | Window) {
		super();
		let hasFocus = FocusTracker.hasFocusWithin(<HTMLElement>element);
		let loosingFocus = false;

		const onFocus = () => {
			loosingFocus = false;
			if (!hasFocus) {
				hasFocus = true;
				this._onDidFocus.fire();
			}
		};

		const onBlur = () => {
			if (hasFocus) {
				loosingFocus = true;
				window.setTimeout(() => {
					if (loosingFocus) {
						loosingFocus = false;
						hasFocus = false;
						this._onDidBlur.fire();
					}
				}, 0);
			}
		};

		this._refreshStateHandler = () => {
			const currentNodeHasFocus = FocusTracker.hasFocusWithin(<HTMLElement>element);
			if (currentNodeHasFocus !== hasFocus) {
				if (hasFocus) {
					onBlur();
				} else {
					onFocus();
				}
			}
		};

		this._register(addDisposableListener(element, EventType.FOCUS, onFocus, true));
		this._register(addDisposableListener(element, EventType.BLUR, onBlur, true));
		this._register(addDisposableListener(element, EventType.FOCUS_IN, () => this._refreshStateHandler()));
		this._register(addDisposableListener(element, EventType.FOCUS_OUT, () => this._refreshStateHandler()));
	}

	refreshState() {
		this._refreshStateHandler();
	}
}

/**
 * Creates a new `IFocusTracker` instance that tracks focus changes on the given `element` and its descendants.
 *
 * @param element The `HTMLElement` or `Window` to track focus changes on.
 * @returns An `IFocusTracker` instance.
 */
export function trackFocus(element: HTMLElement | Window): IFocusTracker {
	return new FocusTracker(element);
}

export function after<T extends Node>(sibling: HTMLElement, child: T): T {
	sibling.after(child);
	return child;
}

export function append<T extends Node>(parent: HTMLElement, child: T): T;
export function append<T extends Node>(parent: HTMLElement, ...children: (T | string)[]): void;
export function append<T extends Node>(parent: HTMLElement, ...children: (T | string)[]): T | void {
	parent.append(...children);
	if (children.length === 1 && typeof children[0] !== 'string') {
		return <T>children[0];
	}
}

export function prepend<T extends Node>(parent: HTMLElement, child: T): T {
	parent.insertBefore(child, parent.firstChild);
	return child;
}

/**
 * Removes all children from `parent` and appends `children`
 */
export function reset(parent: HTMLElement, ...children: Array<Node | string>): void {
	parent.innerText = '';
	append(parent, ...children);
}

const SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;

export enum Namespace {
	HTML = 'http://www.w3.org/1999/xhtml',
	SVG = 'http://www.w3.org/2000/svg'
}

function _$<T extends Element>(namespace: Namespace, description: string, attrs?: { [key: string]: any }, ...children: Array<Node | string>): T {
	const match = SELECTOR_REGEX.exec(description);

	if (!match) {
		throw new Error('Bad use of emmet');
	}

	const tagName = match[1] || 'div';
	let result: T;

	if (namespace !== Namespace.HTML) {
		result = document.createElementNS(namespace as string, tagName) as T;
	} else {
		result = document.createElement(tagName) as unknown as T;
	}

	if (match[3]) {
		result.id = match[3];
	}
	if (match[4]) {
		result.className = match[4].replace(/\./g, ' ').trim();
	}

	if (attrs) {
		Object.entries(attrs).forEach(([name, value]) => {
			if (typeof value === 'undefined') {
				return;
			}

			if (/^on\w+$/.test(name)) {
				(<any>result)[name] = value;
			} else if (name === 'selected') {
				if (value) {
					result.setAttribute(name, 'true');
				}

			} else {
				result.setAttribute(name, value);
			}
		});
	}

	result.append(...children);

	return result as T;
}

export function $<T extends HTMLElement>(description: string, attrs?: { [key: string]: any }, ...children: Array<Node | string>): T {
	return _$(Namespace.HTML, description, attrs, ...children);
}

$.SVG = function <T extends SVGElement>(description: string, attrs?: { [key: string]: any }, ...children: Array<Node | string>): T {
	return _$(Namespace.SVG, description, attrs, ...children);
};

export function join(nodes: Node[], separator: Node | string): Node[] {
	const result: Node[] = [];

	nodes.forEach((node, index) => {
		if (index > 0) {
			if (separator instanceof Node) {
				result.push(separator.cloneNode());
			} else {
				result.push(document.createTextNode(separator));
			}
		}

		result.push(node);
	});

	return result;
}

export function setVisibility(visible: boolean, ...elements: HTMLElement[]): void {
	if (visible) {
		show(...elements);
	} else {
		hide(...elements);
	}
}

export function show(...elements: HTMLElement[]): void {
	for (const element of elements) {
		element.style.display = '';
		element.removeAttribute('aria-hidden');
	}
}

export function hide(...elements: HTMLElement[]): void {
	for (const element of elements) {
		element.style.display = 'none';
		element.setAttribute('aria-hidden', 'true');
	}
}

function findParentWithAttribute(node: Node | null, attribute: string): HTMLElement | null {
	while (node && node.nodeType === node.ELEMENT_NODE) {
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
		const parentFocusable = findParentWithAttribute(node.parentElement, 'tabIndex');
		parentFocusable?.focus();
	}

	node.removeAttribute('tabindex');
}

export function finalHandler<T extends Event>(fn: (event: T) => any): (event: T) => any {
	return e => {
		e.preventDefault();
		e.stopPropagation();
		fn(e);
	};
}

export function domContentLoaded(): Promise<unknown> {
	return new Promise<unknown>(resolve => {
		const readyState = document.readyState;
		if (readyState === 'complete' || (document && document.body !== null)) {
			resolve(undefined);
		} else {
			window.addEventListener('DOMContentLoaded', resolve, false);
		}
	});
}

/**
 * Find a value usable for a dom node size such that the likelihood that it would be
 * displayed with constant screen pixels size is as high as possible.
 *
 * e.g. We would desire for the cursors to be 2px (CSS px) wide. Under a devicePixelRatio
 * of 1.25, the cursor will be 2.5 screen pixels wide. Depending on how the dom node aligns/"snaps"
 * with the screen pixels, it will sometimes be rendered with 2 screen pixels, and sometimes with 3 screen pixels.
 */
export function computeScreenAwareSize(cssPx: number): number {
	const screenPx = window.devicePixelRatio * cssPx;
	return Math.max(1, Math.floor(screenPx)) / window.devicePixelRatio;
}

/**
 * Open safely a new window. This is the best way to do so, but you cannot tell
 * if the window was opened or if it was blocked by the browser's popup blocker.
 * If you want to tell if the browser blocked the new window, use {@link windowOpenWithSuccess}.
 *
 * See https://github.com/microsoft/monaco-editor/issues/601
 * To protect against malicious code in the linked site, particularly phishing attempts,
 * the window.opener should be set to null to prevent the linked site from having access
 * to change the location of the current page.
 * See https://mathiasbynens.github.io/rel-noopener/
 */
export function windowOpenNoOpener(url: string): void {
	// By using 'noopener' in the `windowFeatures` argument, the newly created window will
	// not be able to use `window.opener` to reach back to the current page.
	// See https://stackoverflow.com/a/46958731
	// See https://developer.mozilla.org/en-US/docs/Web/API/Window/open#noopener
	// However, this also doesn't allow us to realize if the browser blocked
	// the creation of the window.
	window.open(url, '_blank', 'noopener');
}

/**
 * Open a new window in a popup. This is the best way to do so, but you cannot tell
 * if the window was opened or if it was blocked by the browser's popup blocker.
 * If you want to tell if the browser blocked the new window, use {@link windowOpenWithSuccess}.
 *
 * Note: this does not set {@link window.opener} to null. This is to allow the opened popup to
 * be able to use {@link window.close} to close itself. Because of this, you should only use
 * this function on urls that you trust.
 *
 * In otherwords, you should almost always use {@link windowOpenNoOpener} instead of this function.
 */
const popupWidth = 780, popupHeight = 640;
export function windowOpenPopup(url: string): void {
	const left = Math.floor(window.screenLeft + window.innerWidth / 2 - popupWidth / 2);
	const top = Math.floor(window.screenTop + window.innerHeight / 2 - popupHeight / 2);
	window.open(
		url,
		'_blank',
		`width=${popupWidth},height=${popupHeight},top=${top},left=${left}`
	);
}

/**
 * Attempts to open a window and returns whether it succeeded. This technique is
 * not appropriate in certain contexts, like for example when the JS context is
 * executing inside a sandboxed iframe. If it is not necessary to know if the
 * browser blocked the new window, use {@link windowOpenNoOpener}.
 *
 * See https://github.com/microsoft/monaco-editor/issues/601
 * See https://github.com/microsoft/monaco-editor/issues/2474
 * See https://mathiasbynens.github.io/rel-noopener/
 *
 * @param url the url to open
 * @param noOpener whether or not to set the {@link window.opener} to null. You should leave the default
 * (true) unless you trust the url that is being opened.
 * @returns boolean indicating if the {@link window.open} call succeeded
 */
export function windowOpenWithSuccess(url: string, noOpener = true): boolean {
	const newTab = window.open();
	if (newTab) {
		if (noOpener) {
			// see `windowOpenNoOpener` for details on why this is important
			(newTab as any).opener = null;
		}
		newTab.location.href = url;
		return true;
	}
	return false;
}

export function animate(fn: () => void): IDisposable {
	const step = () => {
		fn();
		stepDisposable = scheduleAtNextAnimationFrame(step);
	};

	let stepDisposable = scheduleAtNextAnimationFrame(step);
	return toDisposable(() => stepDisposable.dispose());
}

RemoteAuthorities.setPreferredWebSchema(/^https:/.test(window.location.href) ? 'https' : 'http');

/**
 * returns url('...')
 */
export function asCSSUrl(uri: URI | null | undefined): string {
	if (!uri) {
		return `url('')`;
	}
	return `url('${FileAccess.uriToBrowserUri(uri).toString(true).replace(/'/g, '%27')}')`;
}

export function asCSSPropertyValue(value: string) {
	return `'${value.replace(/'/g, '%27')}'`;
}

export function asCssValueWithDefault(cssPropertyValue: string | undefined, dflt: string): string {
	if (cssPropertyValue !== undefined) {
		const variableMatch = cssPropertyValue.match(/^\s*var\((.+)\)$/);
		if (variableMatch) {
			const varArguments = variableMatch[1].split(',', 2);
			if (varArguments.length === 2) {
				dflt = asCssValueWithDefault(varArguments[1].trim(), dflt);
			}
			return `var(${varArguments[0]}, ${dflt})`;
		}
		return cssPropertyValue;
	}
	return dflt;
}

export function triggerDownload(dataOrUri: Uint8Array | URI, name: string): void {

	// If the data is provided as Buffer, we create a
	// blob URL out of it to produce a valid link
	let url: string;
	if (URI.isUri(dataOrUri)) {
		url = dataOrUri.toString(true);
	} else {
		const blob = new Blob([dataOrUri]);
		url = URL.createObjectURL(blob);

		// Ensure to free the data from DOM eventually
		setTimeout(() => URL.revokeObjectURL(url));
	}

	// In order to download from the browser, the only way seems
	// to be creating a <a> element with download attribute that
	// points to the file to download.
	// See also https://developers.google.com/web/updates/2011/08/Downloading-resources-in-HTML5-a-download
	const anchor = document.createElement('a');
	document.body.appendChild(anchor);
	anchor.download = name;
	anchor.href = url;
	anchor.click();

	// Ensure to remove the element from DOM eventually
	setTimeout(() => document.body.removeChild(anchor));
}

export function triggerUpload(): Promise<FileList | undefined> {
	return new Promise<FileList | undefined>(resolve => {

		// In order to upload to the browser, create a
		// input element of type `file` and click it
		// to gather the selected files
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.type = 'file';
		input.multiple = true;

		// Resolve once the input event has fired once
		event.Event.once(event.Event.fromDOMEventEmitter(input, 'input'))(() => {
			resolve(withNullAsUndefined(input.files));
		});

		input.click();

		// Ensure to remove the element from DOM eventually
		setTimeout(() => document.body.removeChild(input));
	});
}

export enum DetectedFullscreenMode {

	/**
	 * The document is fullscreen, e.g. because an element
	 * in the document requested to be fullscreen.
	 */
	DOCUMENT = 1,

	/**
	 * The browser is fullscreen, e.g. because the user enabled
	 * native window fullscreen for it.
	 */
	BROWSER
}

export interface IDetectedFullscreen {

	/**
	 * Figure out if the document is fullscreen or the browser.
	 */
	mode: DetectedFullscreenMode;

	/**
	 * Whether we know for sure that we are in fullscreen mode or
	 * it is a guess.
	 */
	guess: boolean;
}

export function detectFullscreen(): IDetectedFullscreen | null {

	// Browser fullscreen: use DOM APIs to detect
	if (document.fullscreenElement || (<any>document).webkitFullscreenElement || (<any>document).webkitIsFullScreen) {
		return { mode: DetectedFullscreenMode.DOCUMENT, guess: false };
	}

	// There is no standard way to figure out if the browser
	// is using native fullscreen. Via checking on screen
	// height and comparing that to window height, we can guess
	// it though.

	if (window.innerHeight === screen.height) {
		// if the height of the window matches the screen height, we can
		// safely assume that the browser is fullscreen because no browser
		// chrome is taking height away (e.g. like toolbars).
		return { mode: DetectedFullscreenMode.BROWSER, guess: false };
	}

	if (platform.isMacintosh || platform.isLinux) {
		// macOS and Linux do not properly report `innerHeight`, only Windows does
		if (window.outerHeight === screen.height && window.outerWidth === screen.width) {
			// if the height of the browser matches the screen height, we can
			// only guess that we are in fullscreen. It is also possible that
			// the user has turned off taskbars in the OS and the browser is
			// simply able to span the entire size of the screen.
			return { mode: DetectedFullscreenMode.BROWSER, guess: true };
		}
	}

	// Not in fullscreen
	return null;
}

// -- sanitize and trusted html

/**
 * Hooks dompurify using `afterSanitizeAttributes` to check that all `href` and `src`
 * attributes are valid.
 */
export function hookDomPurifyHrefAndSrcSanitizer(allowedProtocols: readonly string[], allowDataImages = false): IDisposable {
	// https://github.com/cure53/DOMPurify/blob/main/demos/hooks-scheme-allowlist.html

	// build an anchor to map URLs to
	const anchor = document.createElement('a');

	dompurify.addHook('afterSanitizeAttributes', (node) => {
		// check all href/src attributes for validity
		for (const attr of ['href', 'src']) {
			if (node.hasAttribute(attr)) {
				const attrValue = node.getAttribute(attr) as string;
				if (attr === 'href' && attrValue.startsWith('#')) {
					// Allow fragment links
					continue;
				}

				anchor.href = attrValue;
				if (!allowedProtocols.includes(anchor.protocol.replace(/:$/, ''))) {
					if (allowDataImages && attr === 'src' && anchor.href.startsWith('data:')) {
						continue;
					}

					node.removeAttribute(attr);
				}
			}
		}
	});

	return toDisposable(() => {
		dompurify.removeHook('afterSanitizeAttributes');
	});
}

const defaultSafeProtocols = [
	Schemas.http,
	Schemas.https,
	Schemas.command,
];

/**
 * List of safe, non-input html tags.
 */
export const basicMarkupHtmlTags = Object.freeze([
	'a',
	'abbr',
	'b',
	'bdo',
	'blockquote',
	'br',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'dd',
	'del',
	'details',
	'dfn',
	'div',
	'dl',
	'dt',
	'em',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'img',
	'ins',
	'kbd',
	'label',
	'li',
	'mark',
	'ol',
	'p',
	'pre',
	'q',
	'rp',
	'rt',
	'ruby',
	'samp',
	'small',
	'small',
	'source',
	'span',
	'strike',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'time',
	'tr',
	'tt',
	'u',
	'ul',
	'var',
	'video',
	'wbr',
]);

const defaultDomPurifyConfig = Object.freeze<dompurify.Config & { RETURN_TRUSTED_TYPE: true }>({
	ALLOWED_TAGS: ['a', 'button', 'blockquote', 'code', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'input', 'label', 'li', 'p', 'pre', 'select', 'small', 'span', 'strong', 'textarea', 'ul', 'ol'],
	ALLOWED_ATTR: ['href', 'data-href', 'data-command', 'target', 'title', 'name', 'src', 'alt', 'class', 'id', 'role', 'tabindex', 'style', 'data-code', 'width', 'height', 'align', 'x-dispatch', 'required', 'checked', 'placeholder', 'type', 'start'],
	RETURN_DOM: false,
	RETURN_DOM_FRAGMENT: false,
	RETURN_TRUSTED_TYPE: true
});

/**
 * Sanitizes the given `value` and reset the given `node` with it.
 */
export function safeInnerHtml(node: HTMLElement, value: string): void {
	const hook = hookDomPurifyHrefAndSrcSanitizer(defaultSafeProtocols);
	try {
		const html = dompurify.sanitize(value, defaultDomPurifyConfig);
		node.innerHTML = html as unknown as string;
	} finally {
		hook.dispose();
	}
}

/**
 * Convert a Unicode string to a string in which each 16-bit unit occupies only one byte
 *
 * From https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/btoa
 */
function toBinary(str: string): string {
	const codeUnits = new Uint16Array(str.length);
	for (let i = 0; i < codeUnits.length; i++) {
		codeUnits[i] = str.charCodeAt(i);
	}
	let binary = '';
	const uint8array = new Uint8Array(codeUnits.buffer);
	for (let i = 0; i < uint8array.length; i++) {
		binary += String.fromCharCode(uint8array[i]);
	}
	return binary;
}

/**
 * Version of the global `btoa` function that handles multi-byte characters instead
 * of throwing an exception.
 */
export function multibyteAwareBtoa(str: string): string {
	return btoa(toBinary(str));
}

type ModifierKey = 'alt' | 'ctrl' | 'shift' | 'meta';

export interface IModifierKeyStatus {
	altKey: boolean;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	lastKeyPressed?: ModifierKey;
	lastKeyReleased?: ModifierKey;
	event?: KeyboardEvent;
}

export class ModifierKeyEmitter extends event.Emitter<IModifierKeyStatus> {

	private readonly _subscriptions = new DisposableStore();
	private _keyStatus: IModifierKeyStatus;
	private static instance: ModifierKeyEmitter;

	private constructor() {
		super();

		this._keyStatus = {
			altKey: false,
			shiftKey: false,
			ctrlKey: false,
			metaKey: false
		};

		this._subscriptions.add(addDisposableListener(window, 'keydown', e => {
			if (e.defaultPrevented) {
				return;
			}

			const event = new StandardKeyboardEvent(e);
			// If Alt-key keydown event is repeated, ignore it #112347
			// Only known to be necessary for Alt-Key at the moment #115810
			if (event.keyCode === KeyCode.Alt && e.repeat) {
				return;
			}

			if (e.altKey && !this._keyStatus.altKey) {
				this._keyStatus.lastKeyPressed = 'alt';
			} else if (e.ctrlKey && !this._keyStatus.ctrlKey) {
				this._keyStatus.lastKeyPressed = 'ctrl';
			} else if (e.metaKey && !this._keyStatus.metaKey) {
				this._keyStatus.lastKeyPressed = 'meta';
			} else if (e.shiftKey && !this._keyStatus.shiftKey) {
				this._keyStatus.lastKeyPressed = 'shift';
			} else if (event.keyCode !== KeyCode.Alt) {
				this._keyStatus.lastKeyPressed = undefined;
			} else {
				return;
			}

			this._keyStatus.altKey = e.altKey;
			this._keyStatus.ctrlKey = e.ctrlKey;
			this._keyStatus.metaKey = e.metaKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.lastKeyPressed) {
				this._keyStatus.event = e;
				this.fire(this._keyStatus);
			}
		}, true));

		this._subscriptions.add(addDisposableListener(window, 'keyup', e => {
			if (e.defaultPrevented) {
				return;
			}

			if (!e.altKey && this._keyStatus.altKey) {
				this._keyStatus.lastKeyReleased = 'alt';
			} else if (!e.ctrlKey && this._keyStatus.ctrlKey) {
				this._keyStatus.lastKeyReleased = 'ctrl';
			} else if (!e.metaKey && this._keyStatus.metaKey) {
				this._keyStatus.lastKeyReleased = 'meta';
			} else if (!e.shiftKey && this._keyStatus.shiftKey) {
				this._keyStatus.lastKeyReleased = 'shift';
			} else {
				this._keyStatus.lastKeyReleased = undefined;
			}

			if (this._keyStatus.lastKeyPressed !== this._keyStatus.lastKeyReleased) {
				this._keyStatus.lastKeyPressed = undefined;
			}

			this._keyStatus.altKey = e.altKey;
			this._keyStatus.ctrlKey = e.ctrlKey;
			this._keyStatus.metaKey = e.metaKey;
			this._keyStatus.shiftKey = e.shiftKey;

			if (this._keyStatus.lastKeyReleased) {
				this._keyStatus.event = e;
				this.fire(this._keyStatus);
			}
		}, true));

		this._subscriptions.add(addDisposableListener(document.body, 'mousedown', () => {
			this._keyStatus.lastKeyPressed = undefined;
		}, true));

		this._subscriptions.add(addDisposableListener(document.body, 'mouseup', () => {
			this._keyStatus.lastKeyPressed = undefined;
		}, true));

		this._subscriptions.add(addDisposableListener(document.body, 'mousemove', e => {
			if (e.buttons) {
				this._keyStatus.lastKeyPressed = undefined;
			}
		}, true));

		this._subscriptions.add(addDisposableListener(window, 'blur', () => {
			this.resetKeyStatus();
		}));
	}

	get keyStatus(): IModifierKeyStatus {
		return this._keyStatus;
	}

	get isModifierPressed(): boolean {
		return this._keyStatus.altKey || this._keyStatus.ctrlKey || this._keyStatus.metaKey || this._keyStatus.shiftKey;
	}

	/**
	 * Allows to explicitly reset the key status based on more knowledge (#109062)
	 */
	resetKeyStatus(): void {
		this.doResetKeyStatus();
		this.fire(this._keyStatus);
	}

	private doResetKeyStatus(): void {
		this._keyStatus = {
			altKey: false,
			shiftKey: false,
			ctrlKey: false,
			metaKey: false
		};
	}

	static getInstance() {
		if (!ModifierKeyEmitter.instance) {
			ModifierKeyEmitter.instance = new ModifierKeyEmitter();
		}

		return ModifierKeyEmitter.instance;
	}

	override dispose() {
		super.dispose();
		this._subscriptions.dispose();
	}
}

export function getCookieValue(name: string): string | undefined {
	const match = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)'); // See https://stackoverflow.com/a/25490531

	return match ? match.pop() : undefined;
}

export interface IDragAndDropObserverCallbacks {
	readonly onDragEnter: (e: DragEvent) => void;
	readonly onDragLeave: (e: DragEvent) => void;
	readonly onDrop: (e: DragEvent) => void;
	readonly onDragEnd: (e: DragEvent) => void;
	readonly onDragOver?: (e: DragEvent, dragDuration: number) => void;
}

export class DragAndDropObserver extends Disposable {

	// A helper to fix issues with repeated DRAG_ENTER / DRAG_LEAVE
	// calls see https://github.com/microsoft/vscode/issues/14470
	// when the element has child elements where the events are fired
	// repeadedly.
	private counter: number = 0;

	// Allows to measure the duration of the drag operation.
	private dragStartTime = 0;

	constructor(private readonly element: HTMLElement, private readonly callbacks: IDragAndDropObserverCallbacks) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(addDisposableListener(this.element, EventType.DRAG_ENTER, (e: DragEvent) => {
			this.counter++;
			this.dragStartTime = e.timeStamp;

			this.callbacks.onDragEnter(e);
		}));

		this._register(addDisposableListener(this.element, EventType.DRAG_OVER, (e: DragEvent) => {
			e.preventDefault(); // needed so that the drop event fires (https://stackoverflow.com/questions/21339924/drop-event-not-firing-in-chrome)

			this.callbacks.onDragOver?.(e, e.timeStamp - this.dragStartTime);
		}));

		this._register(addDisposableListener(this.element, EventType.DRAG_LEAVE, (e: DragEvent) => {
			this.counter--;

			if (this.counter === 0) {
				this.dragStartTime = 0;

				this.callbacks.onDragLeave(e);
			}
		}));

		this._register(addDisposableListener(this.element, EventType.DRAG_END, (e: DragEvent) => {
			this.counter = 0;
			this.dragStartTime = 0;

			this.callbacks.onDragEnd(e);
		}));

		this._register(addDisposableListener(this.element, EventType.DROP, (e: DragEvent) => {
			this.counter = 0;
			this.dragStartTime = 0;

			this.callbacks.onDrop(e);
		}));
	}
}

type HTMLElementAttributeKeys<T> = Partial<{ [K in keyof T]: T[K] extends Function ? never : T[K] extends object ? HTMLElementAttributeKeys<T[K]> : T[K] }>;
type ElementAttributes<T> = HTMLElementAttributeKeys<T> & Record<string, any>;
type RemoveHTMLElement<T> = T extends HTMLElement ? never : T;
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
type ArrayToObj<T extends readonly any[]> = UnionToIntersection<RemoveHTMLElement<T[number]>>;
type HHTMLElementTagNameMap = HTMLElementTagNameMap & { '': HTMLDivElement };

type TagToElement<T> = T extends `${infer TStart}#${string}`
	? TStart extends keyof HHTMLElementTagNameMap
	? HHTMLElementTagNameMap[TStart]
	: HTMLElement
	: T extends `${infer TStart}.${string}`
	? TStart extends keyof HHTMLElementTagNameMap
	? HHTMLElementTagNameMap[TStart]
	: HTMLElement
	: T extends keyof HTMLElementTagNameMap
	? HTMLElementTagNameMap[T]
	: HTMLElement;

type TagToElementAndId<TTag> = TTag extends `${infer TTag}@${infer TId}`
	? { element: TagToElement<TTag>; id: TId }
	: { element: TagToElement<TTag>; id: 'root' };

type TagToRecord<TTag> = TagToElementAndId<TTag> extends { element: infer TElement; id: infer TId }
	? Record<(TId extends string ? TId : never) | 'root', TElement>
	: never;

type Child = HTMLElement | string | Record<string, HTMLElement>;

const H_REGEX = /(?<tag>[\w\-]+)?(?:#(?<id>[\w\-]+))?(?<class>(?:\.(?:[\w\-]+))*)(?:@(?<name>(?:[\w\_])+))?/;

/**
 * A helper function to create nested dom nodes.
 *
 *
 * ```ts
 * const elements = h('div.code-view', [
 * 	h('div.title@title'),
 * 	h('div.container', [
 * 		h('div.gutter@gutterDiv'),
 * 		h('div@editor'),
 * 	]),
 * ]);
 * const editor = createEditor(elements.editor);
 * ```
*/
export function h<TTag extends string>
	(tag: TTag):
	TagToRecord<TTag> extends infer Y ? { [TKey in keyof Y]: Y[TKey] } : never;

export function h<TTag extends string, T extends Child[]>
	(tag: TTag, children: [...T]):
	(ArrayToObj<T> & TagToRecord<TTag>) extends infer Y ? { [TKey in keyof Y]: Y[TKey] } : never;

export function h<TTag extends string>
	(tag: TTag, attributes: Partial<ElementAttributes<TagToElement<TTag>>>):
	TagToRecord<TTag> extends infer Y ? { [TKey in keyof Y]: Y[TKey] } : never;

export function h<TTag extends string, T extends Child[]>
	(tag: TTag, attributes: Partial<ElementAttributes<TagToElement<TTag>>>, children: [...T]):
	(ArrayToObj<T> & TagToRecord<TTag>) extends infer Y ? { [TKey in keyof Y]: Y[TKey] } : never;

export function h(tag: string, ...args: [] | [attributes: { $: string } & Partial<ElementAttributes<HTMLElement>> | Record<string, any>, children?: any[]] | [children: any[]]): Record<string, HTMLElement> {
	let attributes: { $?: string } & Partial<ElementAttributes<HTMLElement>>;
	let children: (Record<string, HTMLElement> | HTMLElement)[] | undefined;

	if (Array.isArray(args[0])) {
		attributes = {};
		children = args[0];
	} else {
		attributes = args[0] as any || {};
		children = args[1];
	}

	const match = H_REGEX.exec(tag);

	if (!match || !match.groups) {
		throw new Error('Bad use of h');
	}

	const tagName = match.groups['tag'] || 'div';
	const el = document.createElement(tagName);

	if (match.groups['id']) {
		el.id = match.groups['id'];
	}

	const classNames = [];
	if (match.groups['class']) {
		for (const className of match.groups['class'].split('.')) {
			if (className !== '') {
				classNames.push(className);
			}
		}
	}
	if (attributes.className !== undefined) {
		for (const className of attributes.className.split('.')) {
			if (className !== '') {
				classNames.push(className);
			}
		}
	}
	if (classNames.length > 0) {
		el.className = classNames.join(' ');
	}

	const result: Record<string, HTMLElement> = {};

	if (match.groups['name']) {
		result[match.groups['name']] = el;
	}

	if (children) {
		for (const c of children) {
			if (c instanceof HTMLElement) {
				el.appendChild(c);
			} else if (typeof c === 'string') {
				el.append(c);
			} else if ('root' in c) {
				Object.assign(result, c);
				el.appendChild(c.root);
			}
		}
	}

	for (const [key, value] of Object.entries(attributes)) {
		if (key === 'className') {
			continue;
		} else if (key === 'style') {
			for (const [cssKey, cssValue] of Object.entries(value)) {
				el.style.setProperty(
					camelCaseToHyphenCase(cssKey),
					typeof cssValue === 'number' ? cssValue + 'px' : '' + cssValue
				);
			}
		} else if (key === 'tabIndex') {
			el.tabIndex = value;
		} else {
			el.setAttribute(camelCaseToHyphenCase(key), value.toString());
		}
	}

	result['root'] = el;

	return result;
}

function camelCaseToHyphenCase(str: string) {
	return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
