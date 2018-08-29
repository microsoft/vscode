/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./builder';
import * as types from 'vs/base/common/types';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import * as assert from 'vs/base/common/assert';
import * as DOM from 'vs/base/browser/dom';

/**
 * !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 *
 * @deprecated !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 */
export interface QuickBuilder {
	(): Builder;
	(builders: Builder[]): Builder;
	(element: HTMLElement): Builder;
	(element: HTMLElement[]): Builder;
	(window: Window): Builder;
	(htmlOrQuerySyntax: string): Builder; // Or, MultiBuilder
	(name: string, args?: any, fn?: (builder: Builder) => any): Builder;
	(one: string, two: string, three: string): Builder;
	(builder: Builder): Builder;
}

// --- Implementation starts here

let MS_DATA_KEY = '_msDataKey';
let DATA_BINDING_ID = '__$binding';
let LISTENER_BINDING_ID = '__$listeners';
let VISIBILITY_BINDING_ID = '__$visibility';

function data(element: any): any {
	if (!element[MS_DATA_KEY]) {
		element[MS_DATA_KEY] = {};
	}

	return element[MS_DATA_KEY];
}

function hasData(element: any): boolean {
	return !!element[MS_DATA_KEY];
}

/**
 * !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 *
 * @deprecated !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 */
export class Builder implements IDisposable {
	private currentElement: HTMLElement;
	private offdom: boolean;
	private container: HTMLElement;
	private createdElements: HTMLElement[];
	private toDispose: { [type: string]: IDisposable[]; };
	private captureToDispose: { [type: string]: IDisposable[]; };

	constructor(element?: HTMLElement, offdom?: boolean) {
		this.offdom = offdom;

		this.container = element;

		this.currentElement = element;
		this.createdElements = [];

		this.toDispose = {};
		this.captureToDispose = {};
	}

	/**
	 *  Returns a new builder that lets the current HTML Element of this builder be the container
	 *  for future additions on the builder.
	 */
	asContainer(): Builder {
		return withBuilder(this, this.offdom);
	}

	/**
	 *  Clones the builder providing the same properties as this one.
	 */
	clone(): Builder {
		let builder = new Builder(this.container, this.offdom);
		builder.currentElement = this.currentElement;
		builder.createdElements = this.createdElements;
		builder.captureToDispose = this.captureToDispose;
		builder.toDispose = this.toDispose;

		return builder;
	}

	/**
	 *  Inserts all created elements of this builder as children to the given container. If the
	 *  container is not provided, the element that was passed into the Builder at construction
	 *  time is being used. The caller can provide the index of insertion, or omit it to append
	 *  at the end.
	 *  This method is a no-op unless the builder was created with the offdom option to be true.
	 */
	build(container?: Builder, index?: number): Builder;
	build(container?: HTMLElement, index?: number): Builder;
	build(container?: any, index?: number): Builder {
		assert.ok(this.offdom, 'This builder was not created off-dom, so build() can not be called.');

		// Use builders own container if present
		if (!container) {
			container = this.container;
		}

		// Handle case of passed in Builder
		else if (container instanceof Builder) {
			container = (<Builder>container).getHTMLElement();
		}

		assert.ok(container, 'Builder can only be build() with a container provided.');
		assert.ok(DOM.isHTMLElement(container), 'The container must either be a HTMLElement or a Builder.');

		let htmlContainer = <HTMLElement>container;

		// Append
		let i: number, len: number;
		let childNodes = htmlContainer.childNodes;
		if (types.isNumber(index) && index < childNodes.length) {
			for (i = 0, len = this.createdElements.length; i < len; i++) {
				htmlContainer.insertBefore(this.createdElements[i], childNodes[index++]);
			}
		} else {
			for (i = 0, len = this.createdElements.length; i < len; i++) {
				htmlContainer.appendChild(this.createdElements[i]);
			}
		}

		return this;
	}

	/**
	 *  Similar to #build, but does not require that the builder is off DOM, and instead
	 *  attached the current element. If the current element has a parent, it will be
	 *  detached from that parent.
	 */
	appendTo(container?: Builder, index?: number): Builder;
	appendTo(container?: HTMLElement, index?: number): Builder;
	appendTo(container?: any, index?: number): Builder {

		// Use builders own container if present
		if (!container) {
			container = this.container;
		}

		// Handle case of passed in Builder
		else if (container instanceof Builder) {
			container = (<Builder>container).getHTMLElement();
		}

		assert.ok(container, 'Builder can only be build() with a container provided.');
		assert.ok(DOM.isHTMLElement(container), 'The container must either be a HTMLElement or a Builder.');

		let htmlContainer = <HTMLElement>container;

		// Remove node from parent, if needed
		if (this.currentElement.parentNode) {
			this.currentElement.parentNode.removeChild(this.currentElement);
		}

		let childNodes = htmlContainer.childNodes;
		if (types.isNumber(index) && index < childNodes.length) {
			htmlContainer.insertBefore(this.currentElement, childNodes[index]);
		} else {
			htmlContainer.appendChild(this.currentElement);
		}

		return this;
	}

	/**
	 *  Performs the exact reverse operation of #append.
	 *  Doing `a.append(b)` is the same as doing `b.appendTo(a)`, with the difference
	 *  of the return value being the builder which called the operation (`a` in the
	 *  first case; `b` in the second case).
	 */
	append(child: HTMLElement, index?: number): Builder;
	append(child: Builder, index?: number): Builder;
	append(child: any, index?: number): Builder {
		assert.ok(child, 'Need a child to append');

		if (DOM.isHTMLElement(child)) {
			child = _withElement(child);
		}

		assert.ok(child instanceof Builder || child instanceof MultiBuilder, 'Need a child to append');

		(<Builder>child).appendTo(this, index);

		return this;
	}

	/**
	 *  Removes the current element of this builder from its parent node.
	 */
	offDOM(): Builder {
		if (this.currentElement.parentNode) {
			this.currentElement.parentNode.removeChild(this.currentElement);
		}

		return this;
	}

	/**
	 *  Returns the HTML Element the builder is currently active on.
	 */
	getHTMLElement(): HTMLElement {
		return this.currentElement;
	}

	/**
	 *  Returns the HTML Element the builder is building in.
	 */
	getContainer(): HTMLElement {
		return this.container;
	}

	// HTML Elements

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	div(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('div', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	p(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('p', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	ul(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('ul', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	li(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('li', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	span(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('span', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	img(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('img', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	a(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('a', attributes, fn);
	}

	/**
	 *  Creates a new element of given tag name as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	element(name: string, attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement(name, attributes, fn);
	}

	private doElement(name: string, attributesOrFn?: any, fn?: (builder: Builder) => void): Builder {

		// Create Element
		let element = document.createElement(name);
		this.currentElement = element;

		// Off-DOM: Remember in array of created elements
		if (this.offdom) {
			this.createdElements.push(element);
		}

		// Object (apply properties as attributes to HTML element)
		if (types.isObject(attributesOrFn)) {
			this.attr(attributesOrFn);
		}

		// Support second argument being function
		if (types.isFunction(attributesOrFn)) {
			fn = attributesOrFn;
		}

		// Apply Functions (Elements created in Functions will be added as child to current element)
		if (types.isFunction(fn)) {
			let builder = new Builder(element);
			fn.call(builder, builder); // Set both 'this' and the first parameter to the new builder
		}

		// Add to parent
		if (!this.offdom) {
			this.container.appendChild(element);
		}

		return this;
	}

	/**
	 *  Calls focus() on the current HTML element;
	 */
	domFocus(): Builder {
		this.currentElement.focus();

		return this;
	}

	/**
	 *  Calls blur() on the current HTML element;
	 */
	domBlur(): Builder {
		this.currentElement.blur();

		return this;
	}

	/**
	 *  Registers listener on event types on the current element.
	 */
	on<E extends Event = Event>(type: string, fn: (e: E, builder: Builder, unbind: IDisposable) => void, listenerToDisposeContainer?: IDisposable[], useCapture?: boolean): Builder;
	on<E extends Event = Event>(typeArray: string[], fn: (e: E, builder: Builder, unbind: IDisposable) => void, listenerToDisposeContainer?: IDisposable[], useCapture?: boolean): Builder;
	on<E extends Event = Event>(arg1: any, fn: (e: E, builder: Builder, unbind: IDisposable) => void, listenerToDisposeContainer?: IDisposable[], useCapture?: boolean): Builder {

		// Event Type Array
		if (types.isArray(arg1)) {
			arg1.forEach((type: string) => {
				this.on(type, fn, listenerToDisposeContainer, useCapture);
			});
		}

		// Single Event Type
		else {
			let type = arg1;

			// Add Listener
			let unbind: IDisposable = DOM.addDisposableListener(this.currentElement, type, (e) => {
				fn(e, this, unbind); // Pass in Builder as Second Argument
			}, useCapture || false);

			// Remember for off() use
			if (useCapture) {
				if (!this.captureToDispose[type]) {
					this.captureToDispose[type] = [];
				}
				this.captureToDispose[type].push(unbind);
			} else {
				if (!this.toDispose[type]) {
					this.toDispose[type] = [];
				}
				this.toDispose[type].push(unbind);
			}

			// Bind to Element
			let listenerBinding: IDisposable[] = this.getProperty(LISTENER_BINDING_ID, []);
			listenerBinding.push(unbind);
			this.setProperty(LISTENER_BINDING_ID, listenerBinding);

			// Add to Array if passed in
			if (listenerToDisposeContainer && types.isArray(listenerToDisposeContainer)) {
				listenerToDisposeContainer.push(unbind);
			}
		}

		return this;
	}

	/**
	 *  Removes all listeners from all elements created by the builder for the given event type.
	 */
	off(type: string, useCapture?: boolean): Builder;
	off(typeArray: string[], useCapture?: boolean): Builder;
	off(arg1: any, useCapture?: boolean): Builder {

		// Event Type Array
		if (types.isArray(arg1)) {
			arg1.forEach((type: string) => {
				this.off(type);
			});
		}

		// Single Event Type
		else {
			let type = arg1;
			if (useCapture) {
				if (this.captureToDispose[type]) {
					this.captureToDispose[type] = dispose(this.captureToDispose[type]);
				}
			} else {
				if (this.toDispose[type]) {
					this.toDispose[type] = dispose(this.toDispose[type]);
				}
			}
		}

		return this;
	}

	/**
	 *  Registers listener on event types on the current element and removes
	 *  them after first invocation.
	 */
	once<E extends Event = Event>(type: string, fn: (e: E, builder: Builder, unbind: IDisposable) => void, listenerToDisposeContainer?: IDisposable[], useCapture?: boolean): Builder;
	once<E extends Event = Event>(typesArray: string[], fn: (e: E, builder: Builder, unbind: IDisposable) => void, listenerToDisposeContainer?: IDisposable[], useCapture?: boolean): Builder;
	once<E extends Event = Event>(arg1: any, fn: (e: E, builder: Builder, unbind: IDisposable) => void, listenerToDisposeContainer?: IDisposable[], useCapture?: boolean): Builder {

		// Event Type Array
		if (types.isArray(arg1)) {
			arg1.forEach((type: string) => {
				this.once(type, fn);
			});
		}

		// Single Event Type
		else {
			let type = arg1;

			// Add Listener
			let unbind: IDisposable = DOM.addDisposableListener(this.currentElement, type, (e) => {
				fn(e, this, unbind); // Pass in Builder as Second Argument
				unbind.dispose();
			}, useCapture || false);

			// Add to Array if passed in
			if (listenerToDisposeContainer && types.isArray(listenerToDisposeContainer)) {
				listenerToDisposeContainer.push(unbind);
			}
		}

		return this;
	}

	/**
	 * 	This method has different characteristics based on the parameter provided:
	 *  a) a single string passed in as argument will return the attribute value using the
	 *  string as key from the current element of the builder.
	 *  b) two strings passed in will set the value of an attribute identified by the first
	 *  parameter to match the second parameter
	 *  c) an object literal passed in will apply the properties of the literal as attributes
	 *  to the current element of the builder.
	 */
	attr(name: string): string;
	attr(name: string, value: string): Builder;
	attr(name: string, value: boolean): Builder;
	attr(name: string, value: number): Builder;
	attr(attributes: any): Builder;
	attr(firstP: any, secondP?: any): any {

		// Apply Object Literal to Attributes of Element
		if (types.isObject(firstP)) {
			for (let prop in firstP) {
				if (firstP.hasOwnProperty(prop)) {
					let value = firstP[prop];
					this.doSetAttr(prop, value);
				}
			}

			return this;
		}

		// Get Attribute Value
		if (types.isString(firstP) && !types.isString(secondP)) {
			return this.currentElement.getAttribute(firstP);
		}

		// Set Attribute Value
		if (types.isString(firstP)) {
			if (!types.isString(secondP)) {
				secondP = String(secondP);
			}
			this.doSetAttr(firstP, secondP);
		}

		return this;
	}

	private doSetAttr(prop: string, value: any): void {
		if (prop === 'class') {
			prop = 'addClass'; // Workaround for the issue that a function name can not be 'class' in ES
		}

		if ((<any>this)[prop]) {
			if (types.isArray(value)) {
				(<any>this)[prop].apply(this, value);
			} else {
				(<any>this)[prop].call(this, value);
			}
		} else {
			this.currentElement.setAttribute(prop, value);
		}
	}

	/**
	 * Removes an attribute by the given name.
	 */
	removeAttribute(prop: string): void {
		this.currentElement.removeAttribute(prop);
	}

	/**
	 *  Sets the id attribute to the value provided for the current HTML element of the builder.
	 */
	id(id: string): Builder {
		this.currentElement.setAttribute('id', id);

		return this;
	}

	/**
	 *  Sets the title attribute to the value provided for the current HTML element of the builder.
	 */
	title(title: string): Builder {
		this.currentElement.setAttribute('title', title);

		return this;
	}

	/**
	 *  Sets the type attribute to the value provided for the current HTML element of the builder.
	 */
	type(type: string): Builder {
		this.currentElement.setAttribute('type', type);

		return this;
	}

	/**
	 *  Sets the value attribute to the value provided for the current HTML element of the builder.
	 */
	value(value: string): Builder {
		this.currentElement.setAttribute('value', value);

		return this;
	}

	/**
	 *  Sets the tabindex attribute to the value provided for the current HTML element of the builder.
	 */
	tabindex(index: number): Builder {
		this.currentElement.setAttribute('tabindex', index.toString());

		return this;
	}

	/**
	 * 	This method has different characteristics based on the parameter provided:
	 *  a) a single string passed in as argument will return the style value using the
	 *  string as key from the current element of the builder.
	 *  b) two strings passed in will set the style value identified by the first
	 *  parameter to match the second parameter. The second parameter can be null
	 *  to unset a style
	 *  c) an object literal passed in will apply the properties of the literal as styles
	 *  to the current element of the builder.
	 */
	style(name: string): string;
	style(name: string, value: string): Builder;
	style(attributes: any): Builder;
	style(firstP: any, secondP?: any): any {

		// Apply Object Literal to Styles of Element
		if (types.isObject(firstP)) {
			for (let prop in firstP) {
				if (firstP.hasOwnProperty(prop)) {
					let value = firstP[prop];
					this.doSetStyle(prop, value);
				}
			}

			return this;
		}

		const hasFirstP = types.isString(firstP);

		// Get Style Value
		if (hasFirstP && types.isUndefined(secondP)) {
			return this.currentElement.style[this.cssKeyToJavaScriptProperty(firstP)];
		}

		// Set Style Value
		else if (hasFirstP) {
			this.doSetStyle(firstP, secondP);
		}

		return this;
	}

	private doSetStyle(key: string, value: string): void {
		if (key.indexOf('-') >= 0) {
			let segments = key.split('-');
			key = segments[0];
			for (let i = 1; i < segments.length; i++) {
				let segment = segments[i];
				key = key + segment.charAt(0).toUpperCase() + segment.substr(1);
			}
		}

		this.currentElement.style[this.cssKeyToJavaScriptProperty(key)] = value;
	}

	private cssKeyToJavaScriptProperty(key: string): string {
		// Automagically convert dashes as they are not allowed when programmatically
		// setting a CSS style property

		if (key.indexOf('-') >= 0) {
			let segments = key.split('-');
			key = segments[0];
			for (let i = 1; i < segments.length; i++) {
				let segment = segments[i];
				key = key + segment.charAt(0).toUpperCase() + segment.substr(1);
			}
		}

		// Float is special too
		else if (key === 'float') {
			key = 'cssFloat';
		}

		return key;
	}

	/**
	 *  Returns the computed CSS style for the current HTML element of the builder.
	 */
	getComputedStyle(): CSSStyleDeclaration {
		return DOM.getComputedStyle(this.currentElement);
	}

	/**
	 *  Adds the variable list of arguments as class names to the current HTML element of the builder.
	 */
	addClass(...classes: string[]): Builder {
		classes.forEach((nameValue: string) => {
			let names = nameValue.split(' ');
			names.forEach((name: string) => {
				DOM.addClass(this.currentElement, name);
			});
		});

		return this;
	}

	/**
	 *  Sets the class name of the current HTML element of the builder to the provided className.
	 *  If shouldAddClass is provided - for true class is added, for false class is removed.
	 */
	setClass(className: string, shouldAddClass: boolean = null): Builder {
		if (shouldAddClass === null) {
			this.currentElement.className = className;
		} else if (shouldAddClass) {
			this.addClass(className);
		} else {
			this.removeClass(className);
		}

		return this;
	}

	/**
	 *  Returns whether the current HTML element of the builder has the provided class assigned.
	 */
	hasClass(className: string): boolean {
		return DOM.hasClass(this.currentElement, className);
	}

	/**
	 *  Removes the variable list of arguments as class names from the current HTML element of the builder.
	 */
	removeClass(...classes: string[]): Builder {
		classes.forEach((nameValue: string) => {
			let names = nameValue.split(' ');
			names.forEach((name: string) => {
				DOM.removeClass(this.currentElement, name);
			});
		});

		return this;
	}

	/**
	 *  Adds or removes the provided className for the current HTML element of the builder.
	 */
	toggleClass(className: string): Builder {
		if (this.hasClass(className)) {
			this.removeClass(className);
		} else {
			this.addClass(className);
		}

		return this;
	}

	/**
	 *  Sets the CSS property color.
	 */
	color(color: string): Builder {
		this.currentElement.style.color = color;

		return this;
	}

	/**
	 *  Sets the CSS property padding.
	 */
	padding(padding: string): Builder;
	padding(top: number, right?: number, bottom?: number, left?: number): Builder;
	padding(top: string, right?: string, bottom?: string, left?: string): Builder;
	padding(top: any, right?: any, bottom?: any, left?: any): Builder {
		if (types.isString(top) && top.indexOf(' ') >= 0) {
			return this.padding.apply(this, top.split(' '));
		}

		if (!types.isUndefinedOrNull(top)) {
			this.currentElement.style.paddingTop = this.toPixel(top);
		}

		if (!types.isUndefinedOrNull(right)) {
			this.currentElement.style.paddingRight = this.toPixel(right);
		}

		if (!types.isUndefinedOrNull(bottom)) {
			this.currentElement.style.paddingBottom = this.toPixel(bottom);
		}

		if (!types.isUndefinedOrNull(left)) {
			this.currentElement.style.paddingLeft = this.toPixel(left);
		}

		return this;
	}

	/**
	 *  Sets the CSS property margin.
	 */
	margin(margin: string): Builder;
	margin(top: number, right?: number, bottom?: number, left?: number): Builder;
	margin(top: string, right?: string, bottom?: string, left?: string): Builder;
	margin(top: any, right?: any, bottom?: any, left?: any): Builder {
		if (types.isString(top) && top.indexOf(' ') >= 0) {
			return this.margin.apply(this, top.split(' '));
		}

		if (!types.isUndefinedOrNull(top)) {
			this.currentElement.style.marginTop = this.toPixel(top);
		}

		if (!types.isUndefinedOrNull(right)) {
			this.currentElement.style.marginRight = this.toPixel(right);
		}

		if (!types.isUndefinedOrNull(bottom)) {
			this.currentElement.style.marginBottom = this.toPixel(bottom);
		}

		if (!types.isUndefinedOrNull(left)) {
			this.currentElement.style.marginLeft = this.toPixel(left);
		}

		return this;
	}

	/**
	 *  Sets the CSS property position.
	 */
	position(position: string): Builder;
	position(top: number, right?: number, bottom?: number, left?: number, position?: string): Builder;
	position(top: string, right?: string, bottom?: string, left?: string, position?: string): Builder;
	position(top: any, right?: any, bottom?: any, left?: any, position?: string): Builder {
		if (types.isString(top) && top.indexOf(' ') >= 0) {
			return this.position.apply(this, top.split(' '));
		}

		if (!types.isUndefinedOrNull(top)) {
			this.currentElement.style.top = this.toPixel(top);
		}

		if (!types.isUndefinedOrNull(right)) {
			this.currentElement.style.right = this.toPixel(right);
		}

		if (!types.isUndefinedOrNull(bottom)) {
			this.currentElement.style.bottom = this.toPixel(bottom);
		}

		if (!types.isUndefinedOrNull(left)) {
			this.currentElement.style.left = this.toPixel(left);
		}

		if (!position) {
			position = 'absolute';
		}

		this.currentElement.style.position = position;

		return this;
	}

	/**
	 *  Sets the CSS property size.
	 */
	size(size: string): Builder;
	size(width: number, height?: number): Builder;
	size(width: string, height?: string): Builder;
	size(width: any, height?: any): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.size.apply(this, width.split(' '));
		}

		if (!types.isUndefinedOrNull(width)) {
			this.currentElement.style.width = this.toPixel(width);
		}

		if (!types.isUndefinedOrNull(height)) {
			this.currentElement.style.height = this.toPixel(height);
		}

		return this;
	}

	/**
	 *  Sets the CSS property display.
	 */
	display(display: string): Builder {
		this.currentElement.style.display = display;

		return this;
	}

	/**
	 *  Shows the current element of the builder.
	 */
	show(): Builder {
		if (this.hasClass('monaco-builder-hidden')) {
			this.removeClass('monaco-builder-hidden');
		}

		this.attr('aria-hidden', 'false');

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityTimeout();

		return this;
	}

	/**
	 *  Shows the current builder element after the provided delay. If the builder
	 *  was set to hidden using the hide() method before this method executed, the
	 *  function will return without showing the current element. This is useful to
	 *  only show the element when a specific delay is reached (e.g. for a long running
	 *  operation.
	 */
	showDelayed(delay: number): Builder {

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityTimeout();

		// Install new delay for showing
		const handle = setTimeout(() => {
			this.removeProperty(VISIBILITY_BINDING_ID);
			this.show();
		}, delay);

		this.setProperty(VISIBILITY_BINDING_ID, toDisposable(() => clearTimeout(handle)));

		return this;
	}

	/**
	 *  Hides the current element of the builder.
	 */
	hide(): Builder {
		if (!this.hasClass('monaco-builder-hidden')) {
			this.addClass('monaco-builder-hidden');
		}
		this.attr('aria-hidden', 'true');

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityTimeout();

		return this;
	}

	/**
	 *  Returns true if the current element of the builder is hidden.
	 */
	isHidden(): boolean {
		return this.hasClass('monaco-builder-hidden') || this.currentElement.style.display === 'none';
	}

	private cancelVisibilityTimeout(): void {
		const visibilityDisposable = this.getProperty(VISIBILITY_BINDING_ID) as IDisposable;
		if (visibilityDisposable) {
			visibilityDisposable.dispose();
			this.removeProperty(VISIBILITY_BINDING_ID);
		}
	}

	private toPixel(obj: any): string {
		if (obj.toString().indexOf('px') === -1) {
			return obj.toString() + 'px';
		}

		return obj;
	}

	/**
	 *  Sets the innerHTML attribute.
	 */
	innerHtml(html: string, append?: boolean): Builder {
		if (append) {
			this.currentElement.innerHTML += html;
		} else {
			this.currentElement.innerHTML = html;
		}

		return this;
	}

	/**
	 *  Sets the textContent property of the element.
	 *  All HTML special characters will be escaped.
	 */
	text(text: string, append?: boolean): Builder {
		if (append) {
			// children is child Elements versus childNodes includes textNodes
			if (this.currentElement.children.length === 0) {
				this.currentElement.textContent += text;
			}
			else {
				// if there are elements inside this node, append the string as a new text node
				// to avoid wiping out the innerHTML and replacing it with only text content
				this.currentElement.appendChild(document.createTextNode(text));
			}
		} else {
			this.currentElement.textContent = text;
		}

		return this;
	}

	/**
	 *  Sets the innerHTML attribute in escaped form.
	 */
	safeInnerHtml(html: string, append?: boolean): Builder {
		return this.innerHtml(strings.escape(html), append);
	}

	/**
	 *  Allows to store arbritary data into the current element.
	 */
	setProperty(key: string, value: any): Builder {
		_setPropertyOnElement(this.currentElement, key, value);

		return this;
	}

	/**
	 *  Allows to get arbritary data from the current element.
	 */
	getProperty(key: string, fallback?: any): any {
		return _getPropertyFromElement(this.currentElement, key, fallback);
	}

	/**
	 *  Removes a property from the current element that is stored under the given key.
	 */
	removeProperty(key: string): Builder {
		if (hasData(this.currentElement)) {
			delete data(this.currentElement)[key];
		}

		return this;
	}

	/**
	 * Returns a new builder with the child at the given index.
	 */
	child(index = 0): Builder {
		let children = this.currentElement.children;

		return _withElement(<HTMLElement>children.item(index));
	}

	/**
	 * Recurse through all descendant nodes and remove their data binding.
	 */
	private unbindDescendants(current: HTMLElement): void {
		if (current && current.children) {
			for (let i = 0, length = current.children.length; i < length; i++) {
				let element = current.children.item(i);

				// Unbind
				if (hasData(<HTMLElement>element)) {

					// Listeners
					let listeners: IDisposable[] = data(<HTMLElement>element)[LISTENER_BINDING_ID];
					if (types.isArray(listeners)) {
						while (listeners.length) {
							listeners.pop().dispose();
						}
					}

					// Delete Data Slot
					delete element[MS_DATA_KEY];
				}

				// Recurse
				this.unbindDescendants(<HTMLElement>element);
			}
		}
	}

	/**
	 *  Removes all HTML elements from the current element of the builder. Will also clean up any
	 *  event listners registered and also clear any data binding and properties stored
	 *  to any child element.
	 */
	empty(): Builder {
		this.unbindDescendants(this.currentElement);

		this.clearChildren();

		if (this.offdom) {
			this.createdElements = [];
		}

		return this;
	}

	/**
	 *  Removes all HTML elements from the current element of the builder.
	 */
	clearChildren(): Builder {

		// Remove Elements
		if (this.currentElement) {
			DOM.clearNode(this.currentElement);
		}

		return this;
	}

	/**
	 *  Removes the current HTML element and all its children from its parent and unbinds
	 *  all listeners and properties set to the data slots.
	 */
	destroy(): void {

		if (this.currentElement) {

			// Remove from parent
			if (this.currentElement.parentNode) {
				this.currentElement.parentNode.removeChild(this.currentElement);
			}

			// Empty to clear listeners and bindings from children
			this.empty();

			// Unbind
			if (hasData(this.currentElement)) {

				// Listeners
				let listeners: IDisposable[] = data(this.currentElement)[LISTENER_BINDING_ID];
				if (types.isArray(listeners)) {
					while (listeners.length) {
						listeners.pop().dispose();
					}
				}

				// Delete Data Slot
				delete this.currentElement[MS_DATA_KEY];
			}
		}

		let type: string;

		for (type in this.toDispose) {
			if (this.toDispose.hasOwnProperty(type) && types.isArray(this.toDispose[type])) {
				this.toDispose[type] = dispose(this.toDispose[type]);
			}
		}

		for (type in this.captureToDispose) {
			if (this.captureToDispose.hasOwnProperty(type) && types.isArray(this.captureToDispose[type])) {
				this.captureToDispose[type] = dispose(this.captureToDispose[type]);
			}
		}

		// Nullify fields
		this.currentElement = null;
		this.container = null;
		this.offdom = null;
		this.createdElements = null;
		this.captureToDispose = null;
		this.toDispose = null;
	}

	/**
	 *  Removes the current HTML element and all its children from its parent and unbinds
	 *  all listeners and properties set to the data slots.
	 */
	dispose(): void {
		this.destroy();
	}

	/**
	 *  Gets the size (in pixels) of an element, including the margin.
	 */
	getTotalSize(): DOM.Dimension {
		let totalWidth = DOM.getTotalWidth(this.currentElement);
		let totalHeight = DOM.getTotalHeight(this.currentElement);

		return new DOM.Dimension(totalWidth, totalHeight);
	}

	/**
	 *  Another variant of getting the inner dimensions of an element.
	 */
	getClientArea(): DOM.Dimension {
		return DOM.getClientArea(this.currentElement);
	}
}

/**
 * !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 *
 * @deprecated !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 */
export class MultiBuilder extends Builder {

	length: number;

	private builders: Builder[];

	constructor(multiBuilder: MultiBuilder);
	constructor(builder: Builder);
	constructor(builders: Builder[]);
	constructor(elements: HTMLElement[]);
	constructor(builders: any) {
		assert.ok(types.isArray(builders) || builders instanceof MultiBuilder, 'Expected Array or MultiBuilder as parameter');

		super();
		this.length = 0;
		this.builders = [];

		// Add Builders to Array
		if (types.isArray(builders)) {
			for (let i = 0; i < builders.length; i++) {
				if (builders[i] instanceof HTMLElement) {
					this.push(_withElement(builders[i]));
				} else {
					this.push(builders[i]);
				}
			}
		} else {
			for (let i = 0; i < (<MultiBuilder>builders).length; i++) {
				this.push((<MultiBuilder>builders).item(i));
			}
		}

		// Mixin Builder functions to operate on all builders
		let $outer = this;
		let propertyFn = (prop: string) => {
			(<any>$outer)[prop] = function (): any {
				let args = Array.prototype.slice.call(arguments);

				let returnValues: any[];
				let mergeBuilders = false;

				for (let i = 0; i < $outer.length; i++) {
					let res = (<any>$outer.item(i))[prop].apply($outer.item(i), args);

					// Merge MultiBuilders into one
					if (res instanceof MultiBuilder) {
						if (!returnValues) {
							returnValues = [];
						}
						mergeBuilders = true;

						for (let j = 0; j < (<MultiBuilder>res).length; j++) {
							returnValues.push((<MultiBuilder>res).item(j));
						}
					}

					// Any other Return Type (e.g. boolean, integer)
					else if (!types.isUndefined(res) && !(res instanceof Builder)) {
						if (!returnValues) {
							returnValues = [];
						}

						returnValues.push(res);
					}
				}

				if (returnValues && mergeBuilders) {
					return new MultiBuilder(returnValues);
				}

				return returnValues || $outer;
			};
		};

		for (let prop in Builder.prototype) {
			if (prop !== 'clone' && prop !== 'and') { // Skip methods that are explicitly defined in MultiBuilder
				if (Builder.prototype.hasOwnProperty(prop) && types.isFunction((<any>Builder).prototype[prop])) {
					propertyFn(prop);
				}
			}
		}
	}

	item(i: number): Builder {
		return this.builders[i];
	}

	push(...items: Builder[]): void {
		for (let i = 0; i < items.length; i++) {
			this.builders.push(items[i]);
		}

		this.length = this.builders.length;
	}

	clone(): MultiBuilder {
		return new MultiBuilder(this);
	}
}

function withBuilder(builder: Builder, offdom?: boolean): Builder {
	if (builder instanceof MultiBuilder) {
		return new MultiBuilder((<MultiBuilder>builder));
	}

	return new Builder(builder.getHTMLElement(), offdom);
}

export function _withElement(element: HTMLElement, offdom?: boolean): Builder {
	return new Builder(element, offdom);
}

function offDOM(): Builder {
	return new Builder(null, true);
}

// Binding functions

/**
 *  Allows to store arbritary data into element.
 */
export function _setPropertyOnElement(element: HTMLElement, key: string, value: any): void {
	data(element)[key] = value;
}

/**
 *  Allows to get arbritary data from element.
 */
export function _getPropertyFromElement(element: HTMLElement, key: string, fallback?: any): any {
	if (hasData(element)) {
		let value = data(element)[key];
		if (!types.isUndefined(value)) {
			return value;
		}
	}

	return fallback;
}

/**
 *  Adds the provided object as property to the given element. Call getBinding()
 *  to retrieve it again.
 */
export function _bindElement(element: HTMLElement, object: any): void {
	_setPropertyOnElement(element, DATA_BINDING_ID, object);
}

let SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((.([\w\-]+))*)/;

/**
 * !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 *
 * @deprecated !!! DO NOT USE. USE vs/base/browser/dom.$ INSTEAD !!!
 */
export const $: QuickBuilder = function (arg?: any): Builder {

	// Off-DOM use
	if (types.isUndefined(arg)) {
		return offDOM();
	}

	// Falsified values cause error otherwise
	if (!arg) {
		throw new Error('Bad use of $');
	}

	// Wrap the given element
	if (DOM.isHTMLElement(arg) || arg === window) {
		return _withElement(arg);
	}

	// Wrap the given builders
	if (types.isArray(arg)) {
		return new MultiBuilder(arg);
	}

	// Wrap the given builder
	if (arg instanceof Builder) {
		return withBuilder((<Builder>arg));
	}

	if (types.isString(arg)) {

		// Use the argument as HTML code
		if (arg[0] === '<') {
			let element: Node;
			let container = document.createElement('div');
			container.innerHTML = strings.format.apply(strings, arguments);

			if (container.children.length === 0) {
				throw new Error('Bad use of $');
			}

			if (container.children.length === 1) {
				element = container.firstChild;
				container.removeChild(element);

				return _withElement(<HTMLElement>element);
			}

			let builders: Builder[] = [];
			while (container.firstChild) {
				element = container.firstChild;
				container.removeChild(element);
				builders.push(_withElement(<HTMLElement>element));
			}

			return new MultiBuilder(builders);
		}

		// Use the argument as a selector constructor
		else if (arguments.length === 1) {
			let match = SELECTOR_REGEX.exec(arg);
			if (!match) {
				throw new Error('Bad use of $');
			}

			let tag = match[1] || 'div';
			let id = match[3] || undefined;
			let classes = (match[4] || '').replace(/\./g, ' ');

			let props: any = {};
			if (id) {
				props['id'] = id;
			}

			if (classes) {
				props['class'] = classes;
			}

			return offDOM().element(tag, props);
		}

		// Use the arguments as the arguments to Builder#element(...)
		else {
			let result = offDOM();
			result.element.apply(result, arguments);
			return result;
		}
	} else {
		throw new Error('Bad use of $');
	}
};
