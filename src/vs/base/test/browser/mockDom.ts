/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

interface IEventMap {
	[name: string]: EventListener[];
}

export class MockEventTarget implements EventTarget {

	private eventMap:IEventMap;

	constructor() {
		this.eventMap = {};
	}

	removeEventListener(type: string, listener: EventListener, useCapture?: boolean): void {
		if(type in this.eventMap) {
			var a = this.eventMap[type];
			a.splice(a.indexOf(listener), 1);
		}
	}

	addEventListener(type: string, listener: EventListener, useCapture?: boolean): void {
		if(type in this.eventMap) {
			this.eventMap[type].push(listener);
		}
		else {
			this.eventMap[type] = [listener];
		}
	}

	dispatchEvent(evt: Event): boolean {
		var listeners = this.eventMap[evt.type];
		if (listeners) {
			listeners.forEach((listener) => {
				listener(evt);
			});
		}
		return evt.defaultPrevented;
	}
}

export class MockNode extends MockEventTarget implements Node {
	// Added to make compiler happy. No real mocking
	classList: DOMTokenList;
	baseURI: string;

	parentElement: HTMLElement;
	nodeType: number;
	previousSibling: Node;
	localName: string;
	namespaceURI: string;
	parentNode: Node;
	nextSibling: Node;
	nodeValue: string;

	public _childNodes: Node[];
	nodeName: string;
	ownerDocument: Document;
	_attributes: Attr[];

	prefix: string;


	constructor(name:string) {
		super();
		this.nodeName = name;
		this._childNodes = [];
		this._attributes = [];
	}

	public get attributes(): NamedNodeMap {
		return <any> this._attributes;
	}

	public get lastChild(): Node {
		return this._childNodes[this._childNodes.length - 1];
	}
	public get firstChild(): Node {
		return this._childNodes[0];
	}

	public get childNodes(): NodeList {
		var a = <any>this._childNodes;
		if(!a.item) {
			a.item = (function(index:number) {
				return this[index];
			}).bind(a);
		}
		return a;
	}

	public get textContent(): string {

		return this._childNodes.filter((node) => {
			return node.nodeType === this.TEXT_NODE;
		}).map((node) => {
			return (<Text>node).wholeText;
		}).join('');
	}

	public set textContent(value:string) {
		this._childNodes = [];
		this.appendChild(this.ownerDocument.createTextNode(value));
	}

	public removeChild(oldChild: Node): Node {
		var i = this._childNodes.indexOf(oldChild);
		if(i >= 0) {
			var removed = this._childNodes.splice(i, 1);
			return removed[0];
		}
		return null;
	}

	public contains(node: Node): boolean {
		return this._childNodes.indexOf(node) !== -1;
	}

	appendChild(newChild: Node): Node {
		this._childNodes.push(newChild);
		return newChild;
	}

	isSupported(feature: string, version: string): boolean {
		throw new Error('Not implemented!');
	}
	isEqualNode(arg: Node): boolean {
		throw new Error('Not implemented!');
	}

	lookupPrefix(namespaceURI: string): string {
		throw new Error('Not implemented!');
	}
	isDefaultNamespace(namespaceURI: string): boolean {
		throw new Error('Not implemented!');
	}
	compareDocumentPosition(other: Node): number {
		throw new Error('Not implemented!');
	}
	normalize(): void {
		throw new Error('Not implemented!');
	}
	isSameNode(other: Node): boolean {
		return this === other;
	}
	hasAttributes(): boolean {
		return this.attributes.length > 0;
	}
	lookupNamespaceURI(prefix: string): string {
		throw new Error('Not implemented!');
	}
	cloneNode(deep?: boolean): Node {
		throw new Error('Not implemented!');
	}
	hasChildNodes(): boolean {
		return this.childNodes.length > 0;
	}
	replaceChild(newChild: Node, oldChild: Node): Node {
		throw new Error('Not implemented!');
	}
	insertBefore(newChild: Node, refChild?: Node): Node {
		throw new Error('Not implemented!');
	}
	ENTITY_REFERENCE_NODE: number = Node.ENTITY_REFERENCE_NODE;
	ATTRIBUTE_NODE: number = Node.ATTRIBUTE_NODE;
	DOCUMENT_FRAGMENT_NODE: number = Node.DOCUMENT_FRAGMENT_NODE;
	TEXT_NODE: number = Node.TEXT_NODE;
	ELEMENT_NODE: number = Node.ELEMENT_NODE;
	COMMENT_NODE: number = Node.COMMENT_NODE;
	DOCUMENT_POSITION_DISCONNECTED: number = Node.DOCUMENT_POSITION_DISCONNECTED;
	DOCUMENT_POSITION_CONTAINED_BY: number = Node.DOCUMENT_POSITION_CONTAINED_BY;
	DOCUMENT_POSITION_CONTAINS: number = Node.DOCUMENT_POSITION_CONTAINS;
	DOCUMENT_TYPE_NODE: number = Node.DOCUMENT_TYPE_NODE;
	DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: number = Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
	DOCUMENT_NODE: number = Node.DOCUMENT_NODE;
	ENTITY_NODE: number = Node.ENTITY_NODE;
	PROCESSING_INSTRUCTION_NODE: number = Node.PROCESSING_INSTRUCTION_NODE;
	CDATA_SECTION_NODE: number = Node.CDATA_SECTION_NODE;
	NOTATION_NODE: number = Node.NOTATION_NODE;
	DOCUMENT_POSITION_FOLLOWING: number = Node.DOCUMENT_POSITION_FOLLOWING;
	DOCUMENT_POSITION_PRECEDING: number = Node.DOCUMENT_POSITION_PRECEDING;
}

export class MockAttribute extends MockNode implements Attr {

	ownerElement: Element;
	value: string;
	name: string;
	// MSAttrExtensions
	expando: boolean;

	constructor(name:string) {
		super(name);
		this.name = name;
		this.expando = false;
	}

	public get specified(): boolean {
		return !!this.value;
	}
}

export interface ClientRect {
	left: number;
	width: number;
	right: number;
	top: number;
	bottom: number;
	height: number;
}

export class MockElement extends MockNode implements Element {
	// Added to make compiler happy. No real mocking
	classList: DOMTokenList;
	id: string;
	className: string;

	scrollTop: number;
	clientLeft: number;
	scrollLeft: number;
	tagName: string;
	clientWidth: number;
	scrollWidth: number;
	clientHeight: number;
	clientTop: number;
	scrollHeight: number;

	constructor(tagName: string) {
		super(tagName);
		this.tagName = tagName;
	}

	getAttribute(name?: string): string {
		var filter = this._attributes.filter((attr) => {
			return attr.name === name;
		});

		return filter.length ? filter[0].value : '';
	}

	get innerHTML(): string {
		throw new Error('Not implemented!');
	}

	set innerHTML(value: string) {
		throw new Error('Not implemented!');
	}

	getElementsByTagNameNS(namespaceURI: string, localName: string): NodeListOf<Element> {
		throw new Error('Not implemented!');
	}
	getElementsByClassName(classNames: string): NodeListOf<Element> {
		throw new Error('Not implemented!');
	}
	hasAttributeNS(namespaceURI: string, localName: string): boolean {
		throw new Error('Not implemented!');
	}
	getBoundingClientRect(): ClientRect {
		throw new Error('Not implemented!');
	}
	getAttributeNS(namespaceURI: string, localName: string): string {
		throw new Error('Not implemented!');
	}
	getAttributeNodeNS(namespaceURI: string, localName: string): Attr {
		throw new Error('Not implemented!');
	}
	setAttributeNodeNS(newAttr: Attr): Attr {
		throw new Error('Not implemented!');
	}
	hasAttribute(name: string): boolean {
		var filter = this._attributes.filter((attr) => {
			return attr.name === name;
		});

		return filter.length > 0;
	}
	removeAttribute(name?: string): void {
		this._attributes = this._attributes.filter((attr) => {
			return attr.name !== name;
		});
	}
	setAttributeNS(namespaceURI: string, qualifiedName: string, value: string): void {
		throw new Error('Not implemented!');
	}
	getAttributeNode(name: string): Attr {
		throw new Error('Not implemented!');
	}
	getElementsByTagName(name: string): NodeListOf<Element> {
		throw new Error('Not implemented!');
	}
	setAttributeNode(newAttr: Attr): Attr {
		throw new Error('Not implemented!');
	}
	getClientRects(): ClientRectList {
		throw new Error('Not implemented!');
	}
	removeAttributeNode(oldAttr: Attr): Attr {
		throw new Error('Not implemented!');
	}
	setAttribute(name?: string, value?: string): void {
		if(this.hasAttribute(name)) {
			this.removeAttribute(name);
		}
		var attr = this.ownerDocument.createAttribute(name);
		attr.ownerElement = this;
		attr.value = value;
		this._attributes.push(attr);
	}
	removeAttributeNS(namespaceURI: string, localName: string): void {
		throw new Error('Not implemented!');
	}

	matches(selector: string): boolean {
		throw new Error('Not implemented!');
	}

	// interface NodeSelector
	querySelectorAll(selectors: string): NodeListOf<Element> {
		throw new Error('Not implemented!');
	}
	querySelector(selectors: string): Element {
		throw new Error('Not implemented!');
	}

	// interface ElementTraversal
	public get childElementCount(): number {
		return this._childNodes.filter((node) => {
			return node.nodeType === this.ELEMENT_NODE;
		}).length;
	}
	previousElementSibling: Element;
	public get lastElementChild(): Element {
		var a = this._childNodes.filter((node) => {
			return node.nodeType === this.ELEMENT_NODE;
		});
		return <any>a[a.length - 1];
	}
	nextElementSibling: Element;
	public get firstElementChild(): Element {
		var a = this._childNodes.filter((node) => {
			return node.nodeType === this.ELEMENT_NODE;
		});
		return <any>a[0];
	}

	// interface MSElementExtensions
	msMatchesSelector(selectors: string): boolean {
		throw new Error('Not implemented!');
	}
	fireEvent(eventName: string, eventObj?: any): boolean {
		throw new Error('Not implemented!');
	}
	// other interface msElementExtensions
	msZoomTo(args: any) {}
	msRequestFullscreen() {}
	msGetUntransformedBounds():ClientRect {
		throw new Error('Not implemented!');
	}
	msRegionOverflow: string;

	requestFullscreen(): void { throw new Error('Not implemented!'); }
	requestPointerLock(): void { throw new Error('Not implemented!'); }

	webkitMatchesSelector(selectors: string): boolean { throw new Error('Not implemented!'); }
	webkitRequestFullScreen(): void { throw new Error('Not implemented!'); }
	webkitRequestFullscreen(): void { throw new Error('Not implemented!'); }

	remove(): void { throw new Error('Not implemented!'); }

	onariarequest: (ev: any) => any;
	oncommand: (ev: any) => any;
	// Pointer events new in IE 11
	onlostpointercapture: (ev: any) => any;
	ongotpointercapture: (ev: any) => any;
	setPointerCapture: (ev: any) => any;
	releasePointerCapture: (ev: any) => any;
	onpointerenter: (ev: any) => any;
	onpointerout: (ev: any) => any;
	onpointerdown: (ev: any) => any;
	onpointerup: (ev: any) => any;
	onpointercancel: (ev: any) => any;
	onpointerover: (ev: any) => any;
	onpointermove: (ev: any) => any;
	onpointerleave: (ev: any) => any;

	onwheel: (ev: any) => any;

	ontouchcancel: (ev: any) => any;
	ontouchend: (ev: any) => any;
	ontouchmove: (ev: any) => any;
	ontouchstart: (ev: any) => any;

	onmspointerenter: (ev:any) => any;
	onmspointerleave: (ev:any) => any;
	onmspointerdown: (ev: any) => any;
	onmsgotpointercapture: (ev: any) => any;
	onmsgesturedoubletap: (ev: any) => any;
	onmspointerhover: (ev: any) => any;
	onmsgesturehold: (ev: any) => any;
	onmspointermove: (ev: any) => any;
	onmsgesturechange: (ev: any) => any;
	onmsgesturestart: (ev: any) => any;
	onmspointercancel: (ev: any) => any;
	onmsgestureend: (ev: any) => any;
	onmsgesturetap: (ev: any) => any;
	onmspointerout: (ev: any) => any;
	onmsinertiastart: (ev: any) => any;
	onmslostpointercapture: (ev: any) => any;
	onmspointerover: (ev: any) => any;
	msContentZoomFactor: number;
	onmspointerup: (ev: any) => any;

	onwebkitfullscreenchange: (ev: Event) => any;
	onwebkitfullscreenerror: (ev: Event) => any;

	msGetRegionContent(): MSRangeCollection {
		throw new Error('Not implemented!');
	}
	msReleasePointerCapture(pointerId: number): void {
		throw new Error('Not implemented!');
	}
	msSetPointerCapture(pointerId: number): void {
		throw new Error('Not implemented!');
	}
}

export class MockCharacterData extends MockNode implements CharacterData {
	length: number;
	data: string;

	constructor(text:string) {
		super(text);
		this.nodeType = this.TEXT_NODE;
		this.length = text.length;
		this.data = text;
	}

	deleteData(offset: number, count: number): void {
		throw new Error('Not implemented!');
	}
	replaceData(offset: number, count: number, arg: string): void {
		throw new Error('Not implemented!');
	}
	appendData(arg: string): void {
		throw new Error('Not implemented!');
	}
	insertData(offset: number, arg: string): void {
		throw new Error('Not implemented!');
	}
	substringData(offset: number, count: number): string {
		throw new Error('Not implemented!');
	}
	remove(): void { throw new Error('Not implemented!'); }
}

export class MockText extends MockCharacterData implements Text {
	wholeText: string;

	constructor(text:string) {
		super(text);
		this.wholeText = text;
	}

	splitText(offset: number): Text {
		throw new Error('Not implemented!');
	}
	replaceWholeText(content: string): Text {
		throw new Error('Not implemented!');
	}
	swapNode(otherNode: Node): Node {
		throw new Error('Not implemented!');
	}
	removeNode(deep?: boolean): Node {
		throw new Error('Not implemented!');
	}
	replaceNode(replacement: Node): Node {
		throw new Error('Not implemented!');
	}
}

export class MockHTMLElement extends MockElement /* implements HTMLElement */ {

	public style: CSSStyleDeclaration;

	constructor(tagName: string) {
		super(tagName);
		this.style = <any> {};
		this.nodeType = this.ELEMENT_NODE;
	}

	public get className(): string {
		return this.getAttribute('class');
	}

	public set className(value:string) {
		this.setAttribute('class', value);
	}

	public get id():string {
		return this.getAttribute('id');
	}

	public set id(value:string) {
		this.setAttribute('id', value);
	}

	public get children(): HTMLCollection {
		var a = <any> this._childNodes.filter((node) => {
			return node.nodeType === this.ELEMENT_NODE;
		});
		if(!a.item) {
			a.item = (function(index:number) {
				return this[index];
			}).bind(a);
		}
		return a;
	}

	get outerHTML(): string {
		var stringer = new DOMStringer(this);
		return stringer.toString(true);
	}

	get innerHTML(): string {
		var stringer = new DOMStringer(this);
		return stringer.toString();
	}

	set innerHTML(value:string) {
		var parser = new DOMParser(this.ownerDocument);
		var nodes = parser.parse(value);
		nodes.forEach((node) => {
			this.appendChild(node);
		});
	}
}

export class MockDocument extends MockEventTarget /*implements Document*/ {
	public createElement(tagName: string): HTMLElement {
		var e = new MockHTMLElement(tagName);
		e.ownerDocument = <any> this;
		return <any> e;
	}
	public createTextNode(data: string): Text {
		var n = new MockText(data);
		n.ownerDocument = <any> this;
		return n;
	}
	public createAttribute(name: string): Attr {
		var a = new MockAttribute(name);
		a.ownerDocument = <any> this;
		return a;
	}
}

export class MockWindow /*implements Window*/ {

}

interface IParserState {
	name: string;
	consumeCharacter(stream:StringStream):IParserState;
	onTransition(parser:DOMParser, nextState:string):void;

}

class ErrorState implements IParserState {
	public name: string;
	public message:string;

	constructor(message:string) {
		this.name = 'error';
		this.message = message;
	}

	consumeCharacter(stream:StringStream):IParserState {
		return this;
	}

	onTransition(parser:DOMParser, nextState:string):void {

	}
}

class TextParser implements IParserState {

	public name: string;
	private textContent: string;

	constructor() {
		this.name = 'text';
		this.textContent = '';
	}

	consumeCharacter(stream:StringStream):IParserState {
		var char = stream.next();
		switch(char) {
			case '<':
				return new TagParser();
			case '>':
				return new ErrorState('Unexpected >');
			default:
				this.textContent += char;
				return this;
		}
	}

	onTransition(parser:DOMParser, nextState:string):void {
		if(this.textContent) {
			var node = parser.document.createTextNode(this.textContent);
			if(parser.currentNode) {
				parser.currentNode.appendChild(node);
			} else {
				parser.root.push(node);
			}
		}
	}
}

interface IMap {
	[name: string]:string;
}

class TagParser implements IParserState {

	public name: string;
	private isClosing:boolean;
	private tagName:string;
	public attributes: IMap;

	constructor() {
		this.name = 'tag';
		this.tagName = '';
		this.isClosing = false;
		this.attributes = {};
	}

	consumeCharacter(stream:StringStream):IParserState {
		var char = stream.next();
		switch(char) {
			case '/':
				this.isClosing = true;
				return this;
			case '>':
				if(this.tagName) {
					return new TextParser();
				}
				else {
					return new ErrorState('No tag name specified');
				}
			case ' ':
				if(this.tagName) {
					if(this.isClosing) {
						return new ErrorState('Closing tags cannot have attributes');
					}
					return new AttributeParser(this);
				} else {
					return new ErrorState('Tag name must be first.');
				}
			default:
				this.tagName += char;
				return this;
		}
	}

	onTransition(parser:DOMParser, nextState:string):void {
		if(this.tagName && nextState !== 'attribute') {
			if(this.isClosing) {
				if(parser.openElements[parser.openElements.length - 1].tagName !== this.tagName) {
					throw new Error('Mismatched closing tag:' + this.tagName);
				} else {
					parser.openElements.pop();
					if(parser.openElements.length) {
						parser.currentNode = parser.openElements[parser.openElements.length - 1];
					} else {
						parser.currentNode = null;
					}
				}
			} else {
				var node = parser.document.createElement(this.tagName);
				Object.keys(this.attributes).forEach((key) => {
					node.setAttribute(key, this.attributes[key]);
				});
				if(parser.currentNode) {
					parser.currentNode.appendChild(node);
				} else {
					parser.root.push(node);
				}
				parser.openElements.push(node);
				parser.currentNode = node;
			}
		}
	}
}

class AttributeParser implements IParserState {
	public name: string;
	private tag: TagParser;
	private attributeName:string;
	public attributeValue:string;
	private inValue:boolean;

	constructor(tag: TagParser) {
		this.name = 'attribute';
		this.tag = tag;
		this.inValue = false;
		this.attributeName = '';
	}

	consumeCharacter(stream:StringStream):IParserState {
		var char = stream.next();
		switch(char) {
			case ' ':
				if(this.inValue) {
					return this.tag;
				} else {
					return this;
				}
			case '=':
				this.inValue = true;
				return new AttributeValueParser(this);
			case '>':
				stream.back();
				return this.tag;
			default:
				if(this.inValue === false) {
					this.attributeName += char;
				}
				return this;

		}
	}

	onTransition(parser:DOMParser, nextState:string):void {
		if(nextState !== 'attributeValue') {
			this.tag.attributes[this.attributeName] = this.attributeValue;
		}
	}
}

class AttributeValueParser implements IParserState {
	public name: string;
	private attribute: AttributeParser;
	private value:string;
	private quote:boolean;

	constructor(attribute:AttributeParser) {
		this.name = 'attributeValue';
		this.attribute = attribute;
		this.value = '';
		this.quote = false;
	}

	consumeCharacter(stream:StringStream):IParserState {
		var char = stream.next();
		switch(char) {
			case '"':
				if(this.quote === false) {
					this.quote = true;
					return this;
				}
				else {
					return this.attribute;
				}
			default:
				if(this.quote === false) {
					return new ErrorState('Expected " character');
				} else {
					this.value += char;
				}
				return this;

		}
	}

	onTransition(parser:DOMParser, nextState:string):void {
		this.attribute.attributeValue = this.value;
	}
}

class StringStream {
	private text: string;
	private index = 0;

	constructor(text:string) {
		this.text = text;
	}

	public more():boolean {
		return this.index < this.text.length;
	}

	public next():string {

		if(this.index >= this.text.length) {
			throw new Error('Past end of string!');
		}

		return this.text[this.index++];
	}

	public back() {
		this.index--;
	}
}

class DOMParser {
	public activeState: IParserState;
	public currentNode: Node;
	public openElements: Element[];
	public root:Node[];
	public document:Document;

	constructor(document:Document) {
		this.document = document;
		this.root = [];
		this.openElements = [];
		this.currentNode = null;
		this.activeState = new TextParser();
	}

	public parse(text:string):Node[] {

		var stream = new StringStream(text);
		while(stream.more()) {
			var nextState = this.activeState.consumeCharacter(stream);
			if(nextState !== this.activeState) {
				this.activeState.onTransition(this, nextState.name);
				this.activeState = nextState;
			}
		}

		if(this.activeState.name === 'error') {
			throw new Error((<ErrorState> this.activeState).message);
		}
		if(this.openElements.length !== 0) {
			throw new Error('Elements not closed: ' + this.openElements.map((element) => {
				return element.tagName;
			}).join());
		}
		return this.root;
	}
}

class DOMStringer {

	private root:Node;

	constructor(root:Node) {
		this.root = root;
	}



	private print(node:Node):string {
		var result = '';
		switch(node.nodeType) {
			case node.ELEMENT_NODE:
				result += this.printElement(<any>node);
				break;
			case node.TEXT_NODE:
				result += this.printText(<any>node);
				break;
		}
		return result;
	}

	private printChildren(node:Node):string {
		var result = '';
		if(node.hasChildNodes()) {
			for(var i = 0; i < node.childNodes.length; i++) {
				result += this.print(node.childNodes.item(i));
			}
		}
		return result;
	}

	private printElement(element:Element):string {
		var result = ['<'];
		result.push(element.tagName);
		if(element.hasAttributes()) {
			var attributes:Attr[] = <any>element.attributes;
			result.push(attributes.reduce((prev:string, current:Attr) => {
				var attr = [prev, current.name];
				if(current.value) {
					attr.push('="', current.value, '"');
				}
				return attr.join('');
			}, ' '));
		}
		result.push('>');
		result.push(this.printChildren(element));
		result.push('</');
		result.push(element.tagName);
		result.push('>');
		return result.join('');
	}

	private printText(text:Text):string {
		return text.wholeText;
	}

	public toString(includeRoot?:boolean):string {
		if(includeRoot) {
			return this.print(this.root);
		} else {
			return this.printChildren(this.root);
		}
	}
}