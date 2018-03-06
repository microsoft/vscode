/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as DOM from 'vs/base/browser/dom';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { escape } from 'vs/base/common/strings';
import { removeMarkdownEscapes, IMarkdownString } from 'vs/base/common/htmlContent';
import { marked, MarkedOptions } from 'vs/base/common/marked/marked';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IDisposable } from 'vs/base/common/lifecycle';

export interface IContentActionHandler {
	callback: (content: string, event?: IMouseEvent) => void;
	disposeables: IDisposable[];
}

export interface RenderOptions {
	className?: string;
	inline?: boolean;
	actionHandler?: IContentActionHandler;
	codeBlockRenderer?: (modeId: string, value: string) => Thenable<string>;
	codeBlockRenderCallback?: () => void;
}

function createElement(options: RenderOptions): HTMLElement {
	const tagName = options.inline ? 'span' : 'div';
	const element = document.createElement(tagName);
	if (options.className) {
		element.className = options.className;
	}
	return element;
}

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

/**
 * Create html nodes for the given content element.
 */
export function renderMarkdown(markdown: IMarkdownString, options: RenderOptions = {}): HTMLElement {
	const element = createElement(options);

	// signal to code-block render that the
	// element has been created
	let signalInnerHTML: Function;
	const withInnerHTML = new Promise(c => signalInnerHTML = c);

	const renderer = new marked.Renderer();
	renderer.image = (href: string, title: string, text: string) => {
		let dimensions: string[] = [];
		if (href) {
			const splitted = href.split('|').map(s => s.trim());
			href = splitted[0];
			const parameters = splitted[1];
			if (parameters) {
				const heightFromParams = /height=(\d+)/.exec(parameters);
				const widthFromParams = /width=(\d+)/.exec(parameters);
				const height = (heightFromParams && heightFromParams[1]);
				const width = (widthFromParams && widthFromParams[1]);
				const widthIsFinite = isFinite(parseInt(width));
				const heightIsFinite = isFinite(parseInt(height));
				if (widthIsFinite) {
					dimensions.push(`width="${width}"`);
				}
				if (heightIsFinite) {
					dimensions.push(`height="${height}"`);
				}
			}
		}
		let attributes: string[] = [];
		if (href) {
			attributes.push(`src="${href}"`);
		}
		if (text) {
			attributes.push(`alt="${text}"`);
		}
		if (title) {
			attributes.push(`title="${title}"`);
		}
		if (dimensions.length) {
			attributes = attributes.concat(dimensions);
		}
		return '<img ' + attributes.join(' ') + '>';
	};
	renderer.link = (href, title, text): string => {
		// Remove markdown escapes. Workaround for https://github.com/chjj/marked/issues/829
		if (href === text) { // raw link case
			text = removeMarkdownEscapes(text);
		}
		title = removeMarkdownEscapes(title);
		href = removeMarkdownEscapes(href);
		if (
			!href
			|| href.match(/^data:|javascript:/i)
			|| (href.match(/^command:/i) && !markdown.isTrusted)
		) {
			// drop the link
			return text;

		} else {
			return `<a href="#" data-href="${href}" title="${title || href}">${text}</a>`;
		}
	};
	renderer.paragraph = (text): string => {
		return `<p>${text}</p>`;
	};

	if (options.codeBlockRenderer) {
		renderer.code = (code, lang) => {
			const value = options.codeBlockRenderer(lang, code);
			// when code-block rendering is async we return sync
			// but update the node with the real result later.
			const id = defaultGenerator.nextId();
			const promise = Promise.all([value, withInnerHTML]).then(values => {
				const strValue = values[0];
				const span = element.querySelector(`div[data-code="${id}"]`);
				if (span) {
					span.innerHTML = strValue;
				}
			}).catch(err => {
				// ignore
			});

			if (options.codeBlockRenderCallback) {
				promise.then(options.codeBlockRenderCallback);
			}

			return `<div class="code" data-code="${id}">${escape(code)}</div>`;
		};
	}

	if (options.actionHandler) {
		options.actionHandler.disposeables.push(DOM.addStandardDisposableListener(element, 'click', event => {
			let target = event.target;
			if (target.tagName !== 'A') {
				target = target.parentElement;
				if (!target || target.tagName !== 'A') {
					return;
				}
			}

			const href = target.dataset['href'];
			if (href) {
				options.actionHandler.callback(href, event);
			}
		}));
	}

	const markedOptions: MarkedOptions = {
		sanitize: true,
		renderer
	};

	element.innerHTML = marked(markdown.value, markedOptions);
	signalInnerHTML();

	return element;
}

// --- formatted string parsing

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

function _renderFormattedText(element: Node, treeNode: IFormatParseTree, actionHandler?: IContentActionHandler) {
	let child: Node;

	if (treeNode.type === FormatType.Text) {
		child = document.createTextNode(treeNode.content);
	}
	else if (treeNode.type === FormatType.Bold) {
		child = document.createElement('b');
	}
	else if (treeNode.type === FormatType.Italics) {
		child = document.createElement('i');
	}
	else if (treeNode.type === FormatType.Action && actionHandler) {
		const a = document.createElement('a');
		a.href = '#';
		actionHandler.disposeables.push(DOM.addStandardDisposableListener(a, 'click', (event) => {
			actionHandler.callback(String(treeNode.index), event);
		}));

		child = a;
	}
	else if (treeNode.type === FormatType.NewLine) {
		child = document.createElement('br');
	}
	else if (treeNode.type === FormatType.Root) {
		child = element;
	}

	if (element !== child) {
		element.appendChild(child);
	}

	if (Array.isArray(treeNode.children)) {
		treeNode.children.forEach((nodeChild) => {
			_renderFormattedText(child, nodeChild, actionHandler);
		});
	}
}

function parseFormattedText(content: string): IFormatParseTree {

	const root: IFormatParseTree = {
		type: FormatType.Root,
		children: []
	};

	let actionItemIndex = 0;
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
				current = stack.pop();
			}

			const type = formatTagType(next);
			if (current.type === type || (current.type === FormatType.Action && type === FormatType.ActionClose)) {
				current = stack.pop();
			} else {
				const newCurrent: IFormatParseTree = {
					type: type,
					children: []
				};

				if (type === FormatType.Action) {
					newCurrent.index = actionItemIndex;
					actionItemIndex++;
				}

				current.children.push(newCurrent);
				stack.push(current);
				current = newCurrent;
			}
		} else if (next === '\n') {
			if (current.type === FormatType.Text) {
				current = stack.pop();
			}

			current.children.push({
				type: FormatType.NewLine
			});

		} else {
			if (current.type !== FormatType.Text) {
				const textCurrent: IFormatParseTree = {
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

	if (current.type === FormatType.Text) {
		current = stack.pop();
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
