/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { createElement, FormattedTextRenderOptions } from 'vs/base/browser/formattedTextRenderer';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IMarkdownString, parseHrefAndDimensions, removeMarkdownEscapes } from 'vs/base/common/htmlContent';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import * as marked from 'vs/base/common/marked/marked';
import { parse } from 'vs/base/common/marshalling';
import { cloneAndChange } from 'vs/base/common/objects';
import { escape } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export interface MarkdownRenderOptions extends FormattedTextRenderOptions {
	codeBlockRenderer?: (modeId: string, value: string) => Promise<string>;
	codeBlockRenderCallback?: () => void;
}

/**
 * Create html nodes for the given content element.
 */
export function renderMarkdown(markdown: IMarkdownString, options: MarkdownRenderOptions = {}): HTMLElement {
	const element = createElement(options);

	const _uriMassage = function (part: string): string {
		let data: any;
		try {
			data = parse(decodeURIComponent(part));
		} catch (e) {
			// ignore
		}
		if (!data) {
			return part;
		}
		data = cloneAndChange(data, value => {
			if (markdown.uris && markdown.uris[value]) {
				return URI.revive(markdown.uris[value]);
			} else {
				return undefined;
			}
		});
		return encodeURIComponent(JSON.stringify(data));
	};

	const _href = function (href: string, isDomUri: boolean): string {
		const data = markdown.uris && markdown.uris[href];
		if (!data) {
			return href;
		}
		let uri = URI.revive(data);
		if (isDomUri) {
			uri = DOM.asDomUri(uri);
		}
		if (uri.query) {
			uri = uri.with({ query: _uriMassage(uri.query) });
		}
		if (data) {
			href = uri.toString(true);
		}
		return href;
	};

	// signal to code-block render that the
	// element has been created
	let signalInnerHTML: () => void;
	const withInnerHTML = new Promise(c => signalInnerHTML = c);

	const renderer = new marked.Renderer();
	renderer.image = (href: string, title: string, text: string) => {
		let dimensions: string[] = [];
		let attributes: string[] = [];
		if (href) {
			({ href, dimensions } = parseHrefAndDimensions(href));
			href = _href(href, true);
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
		href = _href(href, false);
		title = removeMarkdownEscapes(title);
		href = removeMarkdownEscapes(href);
		if (
			!href
			|| href.match(/^data:|javascript:/i)
			|| (href.match(/^command:/i) && !markdown.isTrusted)
			|| href.match(/^command:(\/\/\/)?_workbench\.downloadResource/i)
		) {
			// drop the link
			return text;

		} else {
			// HTML Encode href
			href = href.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
			return `<a href="#" data-href="${href}" title="${title || href}">${text}</a>`;
		}
	};
	renderer.paragraph = (text): string => {
		return `<p>${text}</p>`;
	};

	if (options.codeBlockRenderer) {
		renderer.code = (code, lang) => {
			const value = options.codeBlockRenderer!(lang, code);
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

	const actionHandler = options.actionHandler;
	if (actionHandler) {
		actionHandler.disposeables.add(DOM.addStandardDisposableListener(element, 'click', event => {
			let target: HTMLElement | null = event.target;
			if (target.tagName !== 'A') {
				target = target.parentElement;
				if (!target || target.tagName !== 'A') {
					return;
				}
			}
			try {
				const href = target.dataset['href'];
				if (href) {
					actionHandler.callback(href, event);
				}
			} catch (err) {
				onUnexpectedError(err);
			} finally {
				event.preventDefault();
			}
		}));
	}

	const markedOptions: marked.MarkedOptions = {
		sanitize: true,
		renderer
	};

	element.innerHTML = marked.parse(markdown.value, markedOptions);
	signalInnerHTML!();

	return element;
}
