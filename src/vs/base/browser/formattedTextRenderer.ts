/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from './dom.js';
import { IKeyboardEvent } from './keyboardEvent.js';
import { IMouseEvent } from './mouseEvent.js';
import { DisposableStore } from '../common/lifecycle.js';

export interface IContentActionHandler {
	readonly callback: (content: string, event: IMouseEvent | IKeyboardEvent) => void;
	readonly disposables: DisposableStore;
}

export interface FormattedTextRenderOptions {
	readonly actionHandler?: IContentActionHandler;
	readonly renderCodeSegments?: boolean;
}

export function renderText(text: string, _options?: FormattedTextRenderOptions, target?: HTMLElement): HTMLElement {
	const element = target ?? document.createElement('div');
	element.textContent = text;
	return element;
}

export function renderFormattedText(formattedText: string, options?: FormattedTextRenderOptions, target?: HTMLElement): HTMLElement {
	const element = target ?? document.createElement('div');
	element.textContent = '';
	_renderFormattedText(element, parseFormattedText(formattedText, !!options?.renderCodeSegments), options?.actionHandler, options?.renderCodeSegments);
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
	Code,
	NewLine
}

interface IFormatParseTree {
	type: FormatType;
	content?: string;
	index?: number;
	children?: IFormatParseTree[];
}

function _renderFormattedText(element: Node, treeNode: IFormatParseTree, actionHandler?: IContentActionHandler, renderCodeSegments?: boolean) {
	let child: Node | undefined;

	if (treeNode.type === FormatType.Text) {
		child = document.createTextNode(treeNode.content || '');
	} else if (treeNode.type === FormatType.Bold) {
		child = document.createElement('b');
	} else if (treeNode.type === FormatType.Italics) {
		child = document.createElement('i');
	} else if (treeNode.type === FormatType.Code && renderCodeSegments) {
		child = document.createElement('code');
	} else if (treeNode.type === FormatType.Action && actionHandler) {
		const a = document.createElement('a');
		actionHandler.disposables.add(DOM.addStandardDisposableListener(a, 'click', (event) => {
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
			_renderFormattedText(child, nodeChild, actionHandler, renderCodeSegments);
		});
	}
}

function parseFormattedText(content: string, parseCodeSegments: boolean): IFormatParseTree {

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

		const isEscapedFormatType = (next === '\\' && formatTagType(stream.peek(), parseCodeSegments) !== FormatType.Invalid);
		if (isEscapedFormatType) {
			next = stream.next(); // unread the backslash if it escapes a format tag type
		}

		if (!isEscapedFormatType && isFormatTag(next, parseCodeSegments) && next === stream.peek()) {
			stream.advance();

			if (current.type === FormatType.Text) {
				current = stack.pop()!;
			}

			const type = formatTagType(next, parseCodeSegments);
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

function isFormatTag(char: string, supportCodeSegments: boolean): boolean {
	return formatTagType(char, supportCodeSegments) !== FormatType.Invalid;
}

function formatTagType(char: string, supportCodeSegments: boolean): FormatType {
	switch (char) {
		case '*':
			return FormatType.Bold;
		case '_':
			return FormatType.Italics;
		case '[':
			return FormatType.Action;
		case ']':
			return FormatType.ActionClose;
		case '`':
			return supportCodeSegments ? FormatType.Code : FormatType.Invalid;
		default:
			return FormatType.Invalid;
	}
}
