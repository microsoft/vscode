/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import DOM = require('vs/base/browser/dom');
import htmlContent = require('vs/base/common/htmlContent');

/**
 * Deal with different types of content. See @renderHtml
 */
export function renderHtml2(content:string, actionCallback?:(index:number, event:DOM.IMouseEvent)=>void):Node[];
export function renderHtml2(content:htmlContent.IHTMLContentElement, actionCallback?:(index:number, event:DOM.IMouseEvent)=>void):Node[];
export function renderHtml2(content:htmlContent.IHTMLContentElement[], actionCallback?:(index:number, event:DOM.IMouseEvent)=>void):Node[];
export function renderHtml2(content:any, actionCallback?:(index:number, event:DOM.IMouseEvent)=>void):Node[] {
	if (typeof content === 'string') {
		return [document.createTextNode(content)];
	} else if (Array.isArray(content)) {
		return (<htmlContent.IHTMLContentElement[]>content).map((piece) => renderHtml(piece, actionCallback));
	} else if (content) {
		return [renderHtml(<htmlContent.IHTMLContentElement>content, actionCallback)];
	}
	return [];
}

/**
 * Create html nodes for the given content element.
 * formattedText property supports **bold**, __italics__, and [[actions]]
 * @param content a html element description
 * @param actionCallback a callback function for any action links in the string. Argument is the zero-based index of the clicked action.
 */
export function renderHtml(content:htmlContent.IHTMLContentElement, actionCallback?:(index:number, event:DOM.IMouseEvent)=>void, codeBlockRenderer?:(modeId:string, value:string) => htmlContent.IHTMLContentElement):Node {

	if(content.isText) {
		return document.createTextNode(content.text);
	}

	var tagName = getSafeTagName(content.tagName) || 'div';
	var element = document.createElement(tagName);

	if(content.className) {
		element.className = content.className;
	}
	if(content.text) {
		element.textContent = content.text;
	}
	if(content.style) {
		element.setAttribute('style', content.style);
	}
	if(content.customStyle) {
		Object.keys(content.customStyle).forEach((key) => {
			element.style[key] = content.customStyle[key];
		});
	}
	if (content.code && codeBlockRenderer) {
		let child = codeBlockRenderer(content.code.language, content.code.value);
		element.appendChild(renderHtml(child, actionCallback, codeBlockRenderer));
	}
	if(content.children) {
		content.children.forEach((child) => {
			element.appendChild(renderHtml(child, actionCallback, codeBlockRenderer));
		});
	}
	if(content.formattedText) {
		renderFormattedText(element, parseFormattedText(content.formattedText), actionCallback);
	}

	return element;
}

var SAFE_TAG_NAMES = {
	a: true,
	b: true,
	blockquote: true,
	code: true,
	del: true,
	dd: true,
	div: true,
	dl: true,
	dt: true,
	em: true,
	h1h2h3i: true,
	img: true,
	kbd: true,
	li: true,
	ol: true,
	p: true,
	pre: true,
	s: true,
	span: true,
	sup: true,
	sub: true,
	strong: true,
	strike: true,
	ul: true,
	br: true,
	hr: true,
};

function getSafeTagName(tagName: string): string {
	if (!tagName) {
		return null;
	}
	if (SAFE_TAG_NAMES.hasOwnProperty(tagName)) {
		return tagName;
	}
	return null;
}

class StringStream {
	private source:string;
	private index:number;

	constructor(source:string) {
		this.source = source;
		this.index = 0;
	}

	public eos():boolean {
		return this.index >= this.source.length;
	}

	public next():string {
		var next = this.peek();
		this.advance();
		return next;
	}

	public peek():string {
		return this.source[this.index];
	}

	public advance():void {
		this.index++;
	}
}

enum FormatType {
	Invalid,
	Root,
	Text,
	Bold,
	Italics,
	Action,
	ActionClose,
	NewLine
}

interface IFormatParseTree {
	type: FormatType;
	content?:string;
	index?:number;
	children?: IFormatParseTree[];
}

function renderFormattedText(element:Node, treeNode:IFormatParseTree, actionCallback?:(index:number, event:DOM.IMouseEvent)=>void) {
	var child: Node;

	if(treeNode.type === FormatType.Text) {
		child = document.createTextNode(treeNode.content);
	}
	else if(treeNode.type === FormatType.Bold) {
		child = document.createElement('b');
	}
	else if(treeNode.type === FormatType.Italics) {
		child = document.createElement('i');
	}
	else if(treeNode.type === FormatType.Action) {
		var a = document.createElement('a');
		a.href = '#';
		DOM.addStandardDisposableListener(a, 'click', (event) => {
			actionCallback(treeNode.index, event);
		});

		child = a;
	}
	else if(treeNode.type === FormatType.NewLine) {
		child = document.createElement('br');
	}
	else if(treeNode.type === FormatType.Root) {
		child = element;
	}

	if(element !== child) {
		element.appendChild(child);
	}

	if(Array.isArray(treeNode.children)) {
		treeNode.children.forEach((nodeChild) => {
			renderFormattedText(child, nodeChild, actionCallback);
		});
	}
}

function parseFormattedText(content:string):IFormatParseTree {

	var root:IFormatParseTree = {
		type: FormatType.Root,
		children: []
	};

	var actionItemIndex = 0;
	var current = root;
	var stack:IFormatParseTree[] = [];
	var stream = new StringStream(content);

	while(!stream.eos()) {
		var next = stream.next();

		var isEscapedFormatType = (next === '\\' && formatTagType(stream.peek()) !== FormatType.Invalid);
		if (isEscapedFormatType) {
			next = stream.next(); // unread the backslash if it escapes a format tag type
		}

		if(!isEscapedFormatType && isFormatTag(next) && next === stream.peek()) {
			stream.advance();

			if(current.type === FormatType.Text) {
				current = stack.pop();
			}

			var type = formatTagType(next);
			if(current.type === type || (current.type === FormatType.Action && type === FormatType.ActionClose)) {
				current = stack.pop();
			} else {
				var newCurrent:IFormatParseTree = {
					type: type,
					children: []
				};

				if(type === FormatType.Action) {
					newCurrent.index = actionItemIndex;
					actionItemIndex++;
				}

				current.children.push(newCurrent);
				stack.push(current);
				current = newCurrent;
			}
		} else if(next === '\n') {
			if(current.type === FormatType.Text) {
				current = stack.pop();
			}

			current.children.push({
				type: FormatType.NewLine
			});

		} else {
			if(current.type !== FormatType.Text) {
				var textCurrent:IFormatParseTree = {
					type: FormatType.Text,
					content: next
				};
				current.children.push(textCurrent);
				stack.push(current);
				current = textCurrent;

			} else {
				current.content += next;
			}
		}
	}

	if(current.type === FormatType.Text) {
		current = stack.pop();
	}

	if(stack.length) {
		// incorrectly formatted string literal
	}

	return root;
}

function isFormatTag(char:string):boolean {
	return formatTagType(char) !== FormatType.Invalid;
}

function formatTagType(char:string):FormatType {
	switch(char) {
		case '*':
			return FormatType.Bold;
		case '_':
			return FormatType.Italics;
		case '[':
			return FormatType.Action;
		case ']':
			return FormatType.ActionClose;
		default:
			return FormatType.Invalid;
	}
}