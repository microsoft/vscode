/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./builder';
import { TPromise } from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import strings = require('vs/base/common/strings');
import assert = require('vs/base/common/assert');
import DOM = require('vs/base/browser/dom');

/**
 * Welcome to the monaco builder. The recommended way to use it is:
 *
 * import Builder = require('vs/base/browser/builder');
 * let $ = Builder.$;
 * $(....).fn(...);
 *
 * See below for examples how to invoke the $():
 *
 * 	$()							- creates an offdom builder
 * 	$(builder)					- wraps the given builder
 * 	$(builder[])				- wraps the given builders into a multibuilder
 * 	$('div')					- creates a div
 * 	$('.big')					- creates a div with class `big`
 * 	$('#head')					- creates a div with id `head`
 * 	$('ul#head')				- creates an unordered list with id `head`
 * 	$('<a href="back"></a>')	- constructs a builder from the given HTML
 * 	$('a', { href: 'back'})		- constructs a builder, similarly to the Builder#element() call
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

/**
 * Create a new builder from the element that is uniquely identified by the given identifier. If the
 *  second parameter "offdom" is set to true, the created elements will only be added to the provided
 *  element when the build() method is called.
 */
export function withElementById(id: string, offdom?: boolean): Builder {
	assert.ok(types.isString(id), 'Expected String as parameter');

	let element = document.getElementById(id);
	if (element) {
		return new Builder(element, offdom);
	}

	return null;
}

export let Build = {
	withElementById: withElementById
};

// --- Implementation starts here

let MS_DATA_KEY = '_msDataKey';
let DATA_BINDING_ID = '__$binding';
let LISTENER_BINDING_ID = '__$listeners';
let VISIBILITY_BINDING_ID = '__$visibility';

export class Position {
	public x: number;
	public y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}
}

export class Box {
	public top: number;
	public right: number;
	public bottom: number;
	public left: number;

	constructor(top: number, right: number, bottom: number, left: number) {
		this.top = top;
		this.right = right;
		this.bottom = bottom;
		this.left = left;
	}
}

export class Dimension {
	public width: number;
	public height: number;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	public substract(box: Box): Dimension {
		return new Dimension(this.width - box.left - box.right, this.height - box.top - box.bottom);
	}
}

export interface IRange {
	start: number;
	end: number;
}

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
 *  Wraps around the provided element to manipulate it and add more child elements.
 */
export class Builder implements IDisposable {
	private currentElement: HTMLElement;
	private offdom: boolean;
	private container: HTMLElement;
	private createdElements: HTMLElement[];
	private toUnbind: { [type: string]: IDisposable[]; };
	private captureToUnbind: { [type: string]: IDisposable[]; };

	constructor(element?: HTMLElement, offdom?: boolean) {
		this.offdom = offdom;

		this.container = element;

		this.currentElement = element;
		this.createdElements = [];

		this.toUnbind = {};
		this.captureToUnbind = {};
	}

	/**
	 *  Returns a new builder that lets the current HTML Element of this builder be the container
	 *  for future additions on the builder.
	 */
	public asContainer(): Builder {
		return withBuilder(this, this.offdom);
	}

	/**
	 *  Clones the builder providing the same properties as this one.
	 */
	public clone(): Builder {
		let builder = new Builder(this.container, this.offdom);
		builder.currentElement = this.currentElement;
		builder.createdElements = this.createdElements;
		builder.captureToUnbind = this.captureToUnbind;
		builder.toUnbind = this.toUnbind;

		return builder;
	}

	/**
	 *  Creates a new Builder that performs all operations on the current element of the builder and
	 *  the builder or element being passed in.
	 */
	public and(element: HTMLElement): MultiBuilder;
	public and(builder: Builder): MultiBuilder;
	public and(obj: any): MultiBuilder {

		// Convert HTMLElement to Builder as necessary
		if (!(obj instanceof Builder) && !(obj instanceof MultiBuilder)) {
			obj = new Builder((<HTMLElement>obj), this.offdom);
		}

		// Wrap Builders into MultiBuilder
		let builders: Builder[] = [this];
		if (obj instanceof MultiBuilder) {
			for (let i = 0; i < (<MultiBuilder>obj).length; i++) {
				builders.push((<MultiBuilder>obj).item(i));
			}
		} else {
			builders.push(obj);
		}

		return new MultiBuilder(builders);
	}

	/**
	 *  Inserts all created elements of this builder as children to the given container. If the
	 *  container is not provided, the element that was passed into the Builder at construction
	 *  time is being used. The caller can provide the index of insertion, or omit it to append
	 *  at the end.
	 *  This method is a no-op unless the builder was created with the offdom option to be true.
	 */
	public build(container?: Builder, index?: number): Builder;
	public build(container?: HTMLElement, index?: number): Builder;
	public build(container?: any, index?: number): Builder {
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
	public appendTo(container?: Builder, index?: number): Builder;
	public appendTo(container?: HTMLElement, index?: number): Builder;
	public appendTo(container?: any, index?: number): Builder {

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
	public append(child: HTMLElement, index?: number): Builder;
	public append(child: Builder, index?: number): Builder;
	public append(child: any, index?: number): Builder {
		assert.ok(child, 'Need a child to append');

		if (DOM.isHTMLElement(child)) {
			child = withElement(child);
		}

		assert.ok(child instanceof Builder || child instanceof MultiBuilder, 'Need a child to append');

		(<Builder>child).appendTo(this, index);

		return this;
	}

	/**
	 *  Removes the current element of this builder from its parent node.
	 */
	public offDOM(): Builder {
		if (this.currentElement.parentNode) {
			this.currentElement.parentNode.removeChild(this.currentElement);
		}

		return this;
	}

	/**
	 *  Returns the HTML Element the builder is currently active on.
	 */
	public getHTMLElement(): HTMLElement {
		return this.currentElement;
	}

	/**
	 *  Returns the HTML Element the builder is building in.
	 */
	public getContainer(): HTMLElement {
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
	public div(attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public p(attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public ul(attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public ol(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('ol', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	public li(attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public span(attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public img(attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public a(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('a', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	public header(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('header', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	public section(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('section', attributes, fn);
	}

	/**
	 *  Creates a new element of this kind as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	public footer(attributes?: any, fn?: (builder: Builder) => void): Builder {
		return this.doElement('footer', attributes, fn);
	}

	/**
	 *  Creates a new element of given tag name as child of the current element or parent.
	 *  Accepts an object literal as first parameter that can be used to describe the
	 *  attributes of the element.
	 *  Accepts a function as second parameter that can be used to create child elements
	 *  of the element. The function will be called with a new builder created with the
	 *  provided element.
	 */
	public element(name: string, attributes?: any, fn?: (builder: Builder) => void): Builder {
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
	public domFocus(): Builder {
		this.currentElement.focus();

		return this;
	}

	/**
	 *  Returns true if the current element of this builder is the active element.
	 */
	public hasFocus(): boolean {
		let activeElement: Element = document.activeElement;

		return (activeElement === this.currentElement);
	}

	/**
	 *  Calls select() on the current HTML element;
	 */
	public domSelect(range: IRange = null): Builder {
		let input = <HTMLInputElement>this.currentElement;

		input.select();

		if (range) {
			input.setSelectionRange(range.start, range.end);
		}

		return this;
	}

	/**
	 *  Calls blur() on the current HTML element;
	 */
	public domBlur(): Builder {
		this.currentElement.blur();

		return this;
	}

	/**
	 *  Calls click() on the current HTML element;
	 */
	public domClick(): Builder {
		this.currentElement.click();

		return this;
	}

	/**
	 *  Registers listener on event types on the current element.
	 */
	public on(type: string, fn: (e: Event, builder: Builder, unbind: IDisposable) => void, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder;
	public on(typeArray: string[], fn: (e: Event, builder: Builder, unbind: IDisposable) => void, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder;
	public on(arg1: any, fn: (e: Event, builder: Builder, unbind: IDisposable) => void, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder {

		// Event Type Array
		if (types.isArray(arg1)) {
			arg1.forEach((type: string) => {
				this.on(type, fn, listenerToUnbindContainer, useCapture);
			});
		}

		// Single Event Type
		else {
			let type = arg1;

			// Add Listener
			let unbind: IDisposable = DOM.addDisposableListener(this.currentElement, type, (e: Event) => {
				fn(e, this, unbind); // Pass in Builder as Second Argument
			}, useCapture || false);

			// Remember for off() use
			if (useCapture) {
				if (!this.captureToUnbind[type]) {
					this.captureToUnbind[type] = [];
				}
				this.captureToUnbind[type].push(unbind);
			} else {
				if (!this.toUnbind[type]) {
					this.toUnbind[type] = [];
				}
				this.toUnbind[type].push(unbind);
			}

			// Bind to Element
			let listenerBinding: IDisposable[] = this.getProperty(LISTENER_BINDING_ID, []);
			listenerBinding.push(unbind);
			this.setProperty(LISTENER_BINDING_ID, listenerBinding);

			// Add to Array if passed in
			if (listenerToUnbindContainer && types.isArray(listenerToUnbindContainer)) {
				listenerToUnbindContainer.push(unbind);
			}
		}

		return this;
	}

	/**
	 *  Removes all listeners from all elements created by the builder for the given event type.
	 */
	public off(type: string, useCapture?: boolean): Builder;
	public off(typeArray: string[], useCapture?: boolean): Builder;
	public off(arg1: any, useCapture?: boolean): Builder {

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
				if (this.captureToUnbind[type]) {
					this.captureToUnbind[type] = dispose(this.captureToUnbind[type]);
				}
			} else {
				if (this.toUnbind[type]) {
					this.toUnbind[type] = dispose(this.toUnbind[type]);
				}
			}
		}

		return this;
	}

	/**
	 *  Registers listener on event types on the current element and removes
	 *  them after first invocation.
	 */
	public once(type: string, fn: (e: Event, builder: Builder, unbind: IDisposable) => void, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder;
	public once(typesArray: string[], fn: (e: Event, builder: Builder, unbind: IDisposable) => void, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder;
	public once(arg1: any, fn: (e: Event, builder: Builder, unbind: IDisposable) => void, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder {

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
			let unbind: IDisposable = DOM.addDisposableListener(this.currentElement, type, (e: Event) => {
				fn(e, this, unbind); // Pass in Builder as Second Argument
				unbind.dispose();
			}, useCapture || false);

			// Add to Array if passed in
			if (listenerToUnbindContainer && types.isArray(listenerToUnbindContainer)) {
				listenerToUnbindContainer.push(unbind);
			}
		}

		return this;
	}

	/**
	 *  Registers listener on event types on the current element and causes
	 *  the event to prevent default execution (e.preventDefault()). If the
	 *  parameter "cancelBubble" is set to true, it will also prevent bubbling
	 *  of the event.
	 */
	public preventDefault(type: string, cancelBubble: boolean, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder;
	public preventDefault(typesArray: string[], cancelBubble: boolean, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder;
	public preventDefault(arg1: any, cancelBubble: boolean, listenerToUnbindContainer?: IDisposable[], useCapture?: boolean): Builder {
		let fn = function (e: Event) {
			e.preventDefault();

			if (cancelBubble) {
				if (e.stopPropagation) {
					e.stopPropagation();
				} else {
					e.cancelBubble = true;
				}
			}
		};

		return this.on(arg1, fn, listenerToUnbindContainer, useCapture);
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
	public attr(name: string): string;
	public attr(name: string, value: string): Builder;
	public attr(name: string, value: boolean): Builder;
	public attr(name: string, value: number): Builder;
	public attr(attributes: any): Builder;
	public attr(firstP: any, secondP?: any): any {

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
	public removeAttribute(prop: string): void {
		this.currentElement.removeAttribute(prop);
	}

	/**
	 *  Sets the id attribute to the value provided for the current HTML element of the builder.
	 */
	public id(id: string): Builder {
		this.currentElement.setAttribute('id', id);

		return this;
	}

	/**
	 *  Sets the src attribute to the value provided for the current HTML element of the builder.
	 */
	public src(src: string): Builder {
		this.currentElement.setAttribute('src', src);

		return this;
	}

	/**
	 *  Sets the href attribute to the value provided for the current HTML element of the builder.
	 */
	public href(href: string): Builder {
		this.currentElement.setAttribute('href', href);

		return this;
	}

	/**
	 *  Sets the title attribute to the value provided for the current HTML element of the builder.
	 */
	public title(title: string): Builder {
		this.currentElement.setAttribute('title', title);

		return this;
	}

	/**
	 *  Sets the name attribute to the value provided for the current HTML element of the builder.
	 */
	public name(name: string): Builder {
		this.currentElement.setAttribute('name', name);

		return this;
	}

	/**
	 *  Sets the type attribute to the value provided for the current HTML element of the builder.
	 */
	public type(type: string): Builder {
		this.currentElement.setAttribute('type', type);

		return this;
	}

	/**
	 *  Sets the value attribute to the value provided for the current HTML element of the builder.
	 */
	public value(value: string): Builder {
		this.currentElement.setAttribute('value', value);

		return this;
	}

	/**
	 *  Sets the alt attribute to the value provided for the current HTML element of the builder.
	 */
	public alt(alt: string): Builder {
		this.currentElement.setAttribute('alt', alt);

		return this;
	}

	/**
	 *  Sets the name draggable to the value provided for the current HTML element of the builder.
	 */
	public draggable(isDraggable: boolean): Builder {
		this.currentElement.setAttribute('draggable', isDraggable ? 'true' : 'false');

		return this;
	}

	/**
	 *  Sets the tabindex attribute to the value provided for the current HTML element of the builder.
	 */
	public tabindex(index: number): Builder {
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
	public style(name: string): string;
	public style(name: string, value: string): Builder;
	public style(attributes: any): Builder;
	public style(firstP: any, secondP?: any): any {

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
	public getComputedStyle(): CSSStyleDeclaration {
		return DOM.getComputedStyle(this.currentElement);
	}

	/**
	 *  Adds the variable list of arguments as class names to the current HTML element of the builder.
	 */
	public addClass(...classes: string[]): Builder {
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
	public setClass(className: string, shouldAddClass: boolean = null): Builder {
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
	public hasClass(className: string): boolean {
		return DOM.hasClass(this.currentElement, className);
	}

	/**
	 *  Removes the variable list of arguments as class names from the current HTML element of the builder.
	 */
	public removeClass(...classes: string[]): Builder {
		classes.forEach((nameValue: string) => {
			let names = nameValue.split(' ');
			names.forEach((name: string) => {
				DOM.removeClass(this.currentElement, name);
			});
		});

		return this;
	}

	/**
	 *  Sets the first class to the current HTML element of the builder if the second class is currently set
	 *  and vice versa otherwise.
	 */
	public swapClass(classA: string, classB: string): Builder {
		if (this.hasClass(classA)) {
			this.removeClass(classA);
			this.addClass(classB);
		} else {
			this.removeClass(classB);
			this.addClass(classA);
		}

		return this;
	}

	/**
	 *  Adds or removes the provided className for the current HTML element of the builder.
	 */
	public toggleClass(className: string): Builder {
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
	public color(color: string): Builder {
		this.currentElement.style.color = color;

		return this;
	}

	/**
	 *  Sets the CSS property background.
	 */
	public background(color: string): Builder {
		this.currentElement.style.backgroundColor = color;

		return this;
	}

	/**
	 *  Sets the CSS property padding.
	 */
	public padding(padding: string): Builder;
	public padding(top: number, right?: number, bottom?: number, left?: number): Builder;
	public padding(top: string, right?: string, bottom?: string, left?: string): Builder;
	public padding(top: any, right?: any, bottom?: any, left?: any): Builder {
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
	public margin(margin: string): Builder;
	public margin(top: number, right?: number, bottom?: number, left?: number): Builder;
	public margin(top: string, right?: string, bottom?: string, left?: string): Builder;
	public margin(top: any, right?: any, bottom?: any, left?: any): Builder {
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
	public position(position: string): Builder;
	public position(top: number, right?: number, bottom?: number, left?: number, position?: string): Builder;
	public position(top: string, right?: string, bottom?: string, left?: string, position?: string): Builder;
	public position(top: any, right?: any, bottom?: any, left?: any, position?: string): Builder {
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
	public size(size: string): Builder;
	public size(width: number, height?: number): Builder;
	public size(width: string, height?: string): Builder;
	public size(width: any, height?: any): Builder {
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
	 *  Sets the CSS property min-size.
	 */
	public minSize(size: string): Builder;
	public minSize(width: number, height?: number): Builder;
	public minSize(width: string, height?: string): Builder;
	public minSize(width: any, height?: any): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.minSize.apply(this, width.split(' '));
		}

		if (!types.isUndefinedOrNull(width)) {
			this.currentElement.style.minWidth = this.toPixel(width);
		}

		if (!types.isUndefinedOrNull(height)) {
			this.currentElement.style.minHeight = this.toPixel(height);
		}

		return this;
	}

	/**
	 *  Sets the CSS property max-size.
	 */
	public maxSize(size: string): Builder;
	public maxSize(width: number, height?: number): Builder;
	public maxSize(width: string, height?: string): Builder;
	public maxSize(width: any, height?: any): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.maxSize.apply(this, width.split(' '));
		}

		if (!types.isUndefinedOrNull(width)) {
			this.currentElement.style.maxWidth = this.toPixel(width);
		}

		if (!types.isUndefinedOrNull(height)) {
			this.currentElement.style.maxHeight = this.toPixel(height);
		}

		return this;
	}

	/**
	 *  Sets the CSS property float.
	 */
	public float(float: string): Builder {
		this.currentElement.style.cssFloat = float;

		return this;
	}

	/**
	 *  Sets the CSS property clear.
	 */
	public clear(clear: string): Builder {
		this.currentElement.style.clear = clear;

		return this;
	}

	/**
	 *  Sets the CSS property for fonts back to default.
	 */
	public normal(): Builder {
		this.currentElement.style.fontStyle = 'normal';
		this.currentElement.style.fontWeight = 'normal';
		this.currentElement.style.textDecoration = 'none';

		return this;
	}

	/**
	 *  Sets the CSS property font-style to italic.
	 */
	public italic(): Builder {
		this.currentElement.style.fontStyle = 'italic';

		return this;
	}

	/**
	 *  Sets the CSS property font-weight to bold.
	 */
	public bold(): Builder {
		this.currentElement.style.fontWeight = 'bold';

		return this;
	}

	/**
	 *  Sets the CSS property text-decoration to underline.
	 */
	public underline(): Builder {
		this.currentElement.style.textDecoration = 'underline';

		return this;
	}

	/**
	 *  Sets the CSS property overflow.
	 */
	public overflow(overflow: string): Builder {
		this.currentElement.style.overflow = overflow;

		return this;
	}

	/**
	 *  Sets the CSS property display.
	 */
	public display(display: string): Builder {
		this.currentElement.style.display = display;

		return this;
	}

	public disable(): Builder {
		this.currentElement.setAttribute('disabled', 'disabled');

		return this;
	}

	public enable(): Builder {
		this.currentElement.removeAttribute('disabled');

		return this;
	}

	/**
	 *  Shows the current element of the builder.
	 */
	public show(): Builder {
		if (this.hasClass('builder-hidden')) {
			this.removeClass('builder-hidden');
		}

		this.attr('aria-hidden', 'false');

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityPromise();

		return this;
	}

	/**
	 *  Shows the current builder element after the provided delay. If the builder
	 *  was set to hidden using the hide() method before this method executed, the
	 *  function will return without showing the current element. This is useful to
	 *  only show the element when a specific delay is reached (e.g. for a long running
	 *  operation.
	 */
	public showDelayed(delay: number): Builder {

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityPromise();

		let promise = TPromise.timeout(delay);
		this.setProperty(VISIBILITY_BINDING_ID, promise);

		promise.done(() => {
			this.removeProperty(VISIBILITY_BINDING_ID);
			this.show();
		});

		return this;
	}

	/**
	 *  Hides the current element of the builder.
	 */
	public hide(): Builder {
		if (!this.hasClass('builder-hidden')) {
			this.addClass('builder-hidden');
		}
		this.attr('aria-hidden', 'true');

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityPromise();

		return this;
	}

	/**
	 *  Returns true if the current element of the builder is hidden.
	 */
	public isHidden(): boolean {
		return this.hasClass('builder-hidden') || this.currentElement.style.display === 'none';
	}

	/**
	 *  Toggles visibility of the current element of the builder.
	 */
	public toggleVisibility(): Builder {

		// Cancel any pending showDelayed() invocation
		this.cancelVisibilityPromise();

		this.swapClass('builder-visible', 'builder-hidden');

		if (this.isHidden()) {
			this.attr('aria-hidden', 'true');
		}
		else {
			this.attr('aria-hidden', 'false');
		}

		return this;
	}

	private cancelVisibilityPromise(): void {
		let promise: TPromise<void> = this.getProperty(VISIBILITY_BINDING_ID);
		if (promise) {
			promise.cancel();
			this.removeProperty(VISIBILITY_BINDING_ID);
		}
	}

	/**
	 *  Sets the CSS property border.
	 */
	public border(border: string): Builder;
	public border(width: number, style?: string, color?: string): Builder;
	public border(width: any, style?: string, color?: string): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.border.apply(this, width.split(' '));
		}

		this.currentElement.style.borderWidth = this.toPixel(width);

		if (color) {
			this.currentElement.style.borderColor = color;
		}

		if (style) {
			this.currentElement.style.borderStyle = style;
		}

		return this;
	}

	/**
	 *  Sets the CSS property border-top.
	 */
	public borderTop(border: string): Builder;
	public borderTop(width: number, style: string, color: string): Builder;
	public borderTop(width: any, style?: string, color?: string): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.borderTop.apply(this, width.split(' '));
		}

		this.currentElement.style.borderTopWidth = this.toPixel(width);

		if (color) {
			this.currentElement.style.borderTopColor = color;
		}

		if (style) {
			this.currentElement.style.borderTopStyle = style;
		}

		return this;
	}

	/**
	 *  Sets the CSS property border-bottom.
	 */
	public borderBottom(border: string): Builder;
	public borderBottom(width: number, style: string, color: string): Builder;
	public borderBottom(width: any, style?: string, color?: string): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.borderBottom.apply(this, width.split(' '));
		}

		this.currentElement.style.borderBottomWidth = this.toPixel(width);

		if (color) {
			this.currentElement.style.borderBottomColor = color;
		}

		if (style) {
			this.currentElement.style.borderBottomStyle = style;
		}

		return this;
	}

	/**
	 *  Sets the CSS property border-left.
	 */
	public borderLeft(border: string): Builder;
	public borderLeft(width: number, style: string, color: string): Builder;
	public borderLeft(width: any, style?: string, color?: string): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.borderLeft.apply(this, width.split(' '));
		}

		this.currentElement.style.borderLeftWidth = this.toPixel(width);

		if (color) {
			this.currentElement.style.borderLeftColor = color;
		}

		if (style) {
			this.currentElement.style.borderLeftStyle = style;
		}

		return this;
	}

	/**
	 *  Sets the CSS property border-right.
	 */
	public borderRight(border: string): Builder;
	public borderRight(width: number, style: string, color: string): Builder;
	public borderRight(width: any, style?: string, color?: string): Builder {
		if (types.isString(width) && width.indexOf(' ') >= 0) {
			return this.borderRight.apply(this, width.split(' '));
		}

		this.currentElement.style.borderRightWidth = this.toPixel(width);

		if (color) {
			this.currentElement.style.borderRightColor = color;
		}

		if (style) {
			this.currentElement.style.borderRightStyle = style;
		}

		return this;
	}

	/**
	 *  Sets the CSS property text-align.
	 */
	public textAlign(textAlign: string): Builder {
		this.currentElement.style.textAlign = textAlign;

		return this;
	}

	/**
	 *  Sets the CSS property vertical-align.
	 */
	public verticalAlign(valign: string): Builder {
		this.currentElement.style.verticalAlign = valign;

		return this;
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
	public innerHtml(html: string, append?: boolean): Builder {
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
	public text(text: string, append?: boolean): Builder {
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
	public safeInnerHtml(html: string, append?: boolean): Builder {
		return this.innerHtml(strings.escape(html), append);
	}

	/**
	 *  Adds the provided object as property to the current element. Call getBinding()
	 *  to retrieve it again.
	 */
	public bind(object: any): Builder {
		bindElement(this.currentElement, object);

		return this;
	}

	/**
	 *  Removes the binding of the current element.
	 */
	public unbind(): Builder {
		unbindElement(this.currentElement);

		return this;
	}

	/**
	 *  Returns the object that was passed into the bind() call.
	 */
	public getBinding(): any {
		return getBindingFromElement(this.currentElement);
	}

	/**
	 *  Allows to store arbritary data into the current element.
	 */
	public setProperty(key: string, value: any): Builder {
		setPropertyOnElement(this.currentElement, key, value);

		return this;
	}

	/**
	 *  Allows to get arbritary data from the current element.
	 */
	public getProperty(key: string, fallback?: any): any {
		return getPropertyFromElement(this.currentElement, key, fallback);
	}

	/**
	 *  Removes a property from the current element that is stored under the given key.
	 */
	public removeProperty(key: string): Builder {
		if (hasData(this.currentElement)) {
			delete data(this.currentElement)[key];
		}

		return this;
	}

	/**
	 *  Returns a new builder with the parent element of the current element of the builder.
	 */
	public parent(offdom?: boolean): Builder {
		assert.ok(!this.offdom, 'Builder was created with offdom = true and thus has no parent set');

		return withElement(<HTMLElement>this.currentElement.parentNode, offdom);
	}

	/**
	 *  Returns a new builder with all child elements of the current element of the builder.
	 */
	public children(offdom?: boolean): MultiBuilder {
		let children = this.currentElement.children;

		let builders: Builder[] = [];
		for (let i = 0; i < children.length; i++) {
			builders.push(withElement(<HTMLElement>children.item(i), offdom));
		}

		return new MultiBuilder(builders);
	}

	/**
	 * Returns a new builder with the child at the given index.
	 */
	public child(index = 0): Builder {
		let children = this.currentElement.children;

		return withElement(<HTMLElement>children.item(index));
	}

	/**
	 *  Removes the current HTMLElement from the given builder from this builder if this builders
	 *  current HTMLElement is the direct parent.
	 */
	public removeChild(builder: Builder): Builder {
		if (this.currentElement === builder.parent().getHTMLElement()) {
			this.currentElement.removeChild(builder.getHTMLElement());
		}

		return this;
	}

	/**
	 *  Returns a new builder with all elements matching the provided selector scoped to the
	 *  current element of the builder. Use Build.withElementsBySelector() to run the selector
	 *  over the entire DOM.
	 *  The returned builder is an instance of array that can have 0 elements if the selector does not match any
	 *  elements.
	 */
	public select(selector: string, offdom?: boolean): MultiBuilder {
		assert.ok(types.isString(selector), 'Expected String as parameter');

		let elements = this.currentElement.querySelectorAll(selector);

		let builders: Builder[] = [];
		for (let i = 0; i < elements.length; i++) {
			builders.push(withElement(<HTMLElement>elements.item(i), offdom));
		}

		return new MultiBuilder(builders);
	}

	/**
	 *  Returns true if the current element of the builder matches the given selector and false otherwise.
	 */
	public matches(selector: string): boolean {
		let element = this.currentElement;
		let matches = (<any>element).webkitMatchesSelector || (<any>element).mozMatchesSelector || (<any>element).msMatchesSelector || (<any>element).oMatchesSelector;

		return matches && matches.call(element, selector);
	}

	/**
	 *  Returns true if the current element of the builder has no children.
	 */
	public isEmpty(): boolean {
		return !this.currentElement.childNodes || this.currentElement.childNodes.length === 0;
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
	public empty(): Builder {
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
	public clearChildren(): Builder {
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
	public destroy(): void {

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

		for (type in this.toUnbind) {
			if (this.toUnbind.hasOwnProperty(type) && types.isArray(this.toUnbind[type])) {
				this.toUnbind[type] = dispose(this.toUnbind[type]);
			}
		}

		for (type in this.captureToUnbind) {
			if (this.captureToUnbind.hasOwnProperty(type) && types.isArray(this.captureToUnbind[type])) {
				this.captureToUnbind[type] = dispose(this.captureToUnbind[type]);
			}
		}

		// Nullify fields
		this.currentElement = null;
		this.container = null;
		this.offdom = null;
		this.createdElements = null;
		this.captureToUnbind = null;
		this.toUnbind = null;
	}

	/**
	 *  Removes the current HTML element and all its children from its parent and unbinds
	 *  all listeners and properties set to the data slots.
	 */
	public dispose(): void {
		this.destroy();
	}

	/**
	 *  Gets the size (in pixels) of an element, including the margin.
	 */
	public getTotalSize(): Dimension {
		let totalWidth = DOM.getTotalWidth(this.currentElement);
		let totalHeight = DOM.getTotalHeight(this.currentElement);

		return new Dimension(totalWidth, totalHeight);
	}

	/**
	 *  Gets the size (in pixels) of the inside of the element, excluding the border and padding.
	 */
	public getContentSize(): Dimension {
		let contentWidth = DOM.getContentWidth(this.currentElement);
		let contentHeight = DOM.getContentHeight(this.currentElement);

		return new Dimension(contentWidth, contentHeight);
	}

	/**
	 *  Another variant of getting the inner dimensions of an element.
	 */
	public getClientArea(): Dimension {

		// 0.) Try with DOM clientWidth / clientHeight
		if (this.currentElement !== document.body) {
			return new Dimension(this.currentElement.clientWidth, this.currentElement.clientHeight);
		}

		// 1.) Try innerWidth / innerHeight
		if (window.innerWidth && window.innerHeight) {
			return new Dimension(window.innerWidth, window.innerHeight);
		}

		// 2.) Try with document.body.clientWidth / document.body.clientHeigh
		if (document.body && document.body.clientWidth && document.body.clientWidth) {
			return new Dimension(document.body.clientWidth, document.body.clientHeight);
		}

		// 3.) Try with document.documentElement.clientWidth / document.documentElement.clientHeight
		if (document.documentElement && document.documentElement.clientWidth && document.documentElement.clientHeight) {
			return new Dimension(document.documentElement.clientWidth, document.documentElement.clientHeight);
		}

		throw new Error('Unable to figure out browser width and height');
	}
}

/**
 *  The multi builder provides the same methods as the builder, but allows to call
 *  them on an array of builders.
 */
export class MultiBuilder extends Builder {

	public length: number;

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
					this.push(withElement(builders[i]));
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

	public item(i: number): Builder {
		return this.builders[i];
	}

	public push(...items: Builder[]): void {
		for (let i = 0; i < items.length; i++) {
			this.builders.push(items[i]);
		}

		this.length = this.builders.length;
	}

	public pop(): Builder {
		let element = this.builders.pop();
		this.length = this.builders.length;

		return element;
	}

	public concat(items: Builder[]): Builder[] {
		let elements = this.builders.concat(items);
		this.length = this.builders.length;

		return elements;
	}

	public shift(): Builder {
		let element = this.builders.shift();
		this.length = this.builders.length;

		return element;
	}

	public unshift(item: Builder): number {
		let res = this.builders.unshift(item);
		this.length = this.builders.length;

		return res;
	}

	public slice(start: number, end?: number): Builder[] {
		let elements = this.builders.slice(start, end);
		this.length = this.builders.length;

		return elements;
	}

	public splice(start: number, deleteCount?: number): Builder[] {
		let elements = this.builders.splice(start, deleteCount);
		this.length = this.builders.length;

		return elements;
	}

	public clone(): MultiBuilder {
		return new MultiBuilder(this);
	}

	public and(element: HTMLElement): MultiBuilder;
	public and(builder: Builder): MultiBuilder;
	public and(obj: any): MultiBuilder {

		// Convert HTMLElement to Builder as necessary
		if (!(obj instanceof Builder) && !(obj instanceof MultiBuilder)) {
			obj = new Builder((<HTMLElement>obj));
		}

		let builders: Builder[] = [];
		if (obj instanceof MultiBuilder) {
			for (let i = 0; i < (<MultiBuilder>obj).length; i++) {
				builders.push((<MultiBuilder>obj).item(i));
			}
		} else {
			builders.push(obj);
		}

		this.push.apply(this, builders);

		return this;
	}
}

function withBuilder(builder: Builder, offdom?: boolean): Builder {
	if (builder instanceof MultiBuilder) {
		return new MultiBuilder((<MultiBuilder>builder));
	}

	return new Builder(builder.getHTMLElement(), offdom);
}

function withElement(element: HTMLElement, offdom?: boolean): Builder {
	return new Builder(element, offdom);
}

function offDOM(): Builder {
	return new Builder(null, true);
}

// Binding functions

/**
 *  Allows to store arbritary data into element.
 */
export function setPropertyOnElement(element: HTMLElement, key: string, value: any): void {
	data(element)[key] = value;
}

/**
 *  Allows to get arbritary data from element.
 */
export function getPropertyFromElement(element: HTMLElement, key: string, fallback?: any): any {
	if (hasData(element)) {
		let value = data(element)[key];
		if (!types.isUndefined(value)) {
			return value;
		}
	}

	return fallback;
}

/**
 *  Removes a property from an element.
 */
export function removePropertyFromElement(element: HTMLElement, key: string): void {
	if (hasData(element)) {
		delete data(element)[key];
	}
}

/**
 *  Adds the provided object as property to the given element. Call getBinding()
 *  to retrieve it again.
 */
export function bindElement(element: HTMLElement, object: any): void {
	setPropertyOnElement(element, DATA_BINDING_ID, object);
}

/**
 *  Removes the binding of the given element.
 */
export function unbindElement(element: HTMLElement): void {
	removePropertyFromElement(element, DATA_BINDING_ID);
}

/**
 *  Returns the object that was passed into the bind() call for the element.
 */
export function getBindingFromElement(element: HTMLElement): any {
	return getPropertyFromElement(element, DATA_BINDING_ID);
}

export let Binding = {
	setPropertyOnElement: setPropertyOnElement,
	getPropertyFromElement: getPropertyFromElement,
	removePropertyFromElement: removePropertyFromElement,
	bindElement: bindElement,
	unbindElement: unbindElement,
	getBindingFromElement: getBindingFromElement
};

let SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((.([\w\-]+))*)/;

export let $: QuickBuilder = function (arg?: any): Builder {

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
		return withElement(arg);
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

				return withElement(<HTMLElement>element);
			}

			let builders: Builder[] = [];
			while (container.firstChild) {
				element = container.firstChild;
				container.removeChild(element);
				builders.push(withElement(<HTMLElement>element));
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

(<any>$).Box = Box;
(<any>$).Dimension = Dimension;
(<any>$).Position = Position;
(<any>$).Builder = Builder;
(<any>$).MultiBuilder = MultiBuilder;
(<any>$).Build = Build;
(<any>$).Binding = Binding;