/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { createElement, IContentActionHandler, RenderOptions } from 'vs/base/browser/htmlContentRenderer';

export function renderText(text: string, options: RenderOptions = {}): HTMLElement {
	const element = createElement(options);
	element.textContent = text;
	return element;
}

export function renderFormattedText(formattedText: string, options: RenderOptions = {}): HTMLElement {
	const element = createElement(options);
	_renderFormattedText(element, parseFormattedText(formattedText), options.actionHandler);
	return element;
}

class StringStream {
	private source: string;
	private index: number;

	constructor(source: string) {
		this.source = source;
		this.index = 0;
	}

	public eos(): boolean {
		return this.index >= this.source.length;
	}

	public next(): string {
		const next = this.peek();
		this.advance();
		return next;
	}

	public peek(): string {
		return this.source[this.index];
	}

	public advance(): void {
		this.index++;
	}
}

const enum FormatType {
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
	content?: string;
	index?: number;
	children?: IFormatParseTree[];
}

export function _renderFormattedText(element: Node, treeNode: IFormatParseTree, actionHandler?: IContentActionHandler) {
	let child: Node | undefined;

	if (treeNode.type === FormatType.Text) {
		child = document.createTextNode(treeNode.content || '');
	} else if (treeNode.type === FormatType.Bold) {
		child = document.createElement('b');
	} else if (treeNode.type === FormatType.Italics) {
		child = document.createElement('i');
	} else if (treeNode.type === FormatType.Action && actionHandler) {
		const a = document.createElement('a');
		a.href = '#';
		actionHandler.disposeables.add(DOM.addStandardDisposableListener(a, 'click', (event) => {
			actionHandler.callback(String(treeNode.index), event);
		}));

		child = a;
	} else if (treeNode.type === FormatType.NewLine) {
		child = document.createElement('br');
	} else if (treeNode.type === FormatType.Root) {
		child = element;
	}

	if (child && element !== child) {
		element.appendChild(child);
	}

	if (child && Array.isArray(treeNode.children)) {
		treeNode.children.forEach((nodeChild) => {
			_renderFormattedText(child!, nodeChild, actionHandler);
		});
	}
}

export function parseFormattedText(content: string): IFormatParseTree {

	const root: IFormatParseTree = {
		type: FormatType.Root,
		children: []
	};

	let actionViewItemIndex = 0;
	let current = root;
	const stack: IFormatParseTree[] = [];
	const stream = new StringStream(content);

	while (!stream.eos()) {
		let next = stream.next();

		const isEscapedFormatType = (next === '\\' && formatTagType(stream.peek()) !== FormatType.Invalid);
		if (isEscapedFormatType) {
			next = stream.next(); // unread the backslash if it escapes a format tag type
		}

		if (!isEscapedFormatType && isFormatTag(next) && next === stream.peek()) {
			stream.advance();

			if (current.type === FormatType.Text) {
				current = stack.pop()!;
			}

			const type = formatTagType(next);
			if (current.type === type || (current.type === FormatType.Action && type === FormatType.ActionClose)) {
				current = stack.pop()!;
			} else {
				const newCurrent: IFormatParseTree = {
					type: type,
					children: []
				};

				if (type === FormatType.Action) {
					newCurrent.index = actionViewItemIndex;
					actionViewItemIndex++;
				}

				current.children!.push(newCurrent);
				stack.push(current);
				current = newCurrent;
			}
		} else if (next === '\n') {
			if (current.type === FormatType.Text) {
				current = stack.pop()!;
			}

			current.children!.push({
				type: FormatType.NewLine
			});

		} else {
			if (current.type !== FormatType.Text) {
				const textCurrent: IFormatParseTree = {
					type: FormatType.Text,
					content: next
				};
				current.children!.push(textCurrent);
				stack.push(current);
				current = textCurrent;

			} else {
				current.content += next;
			}
		}
	}

	if (current.type === FormatType.Text) {
		current = stack.pop()!;
	}

	if (stack.length) {
		// incorrectly formatted string literal
	}

	return root;
}

function isFormatTag(char: string): boolean {
	return formatTagType(char) !== FormatType.Invalid;
}

function formatTagType(char: string): FormatType {
	switch (char) {
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
