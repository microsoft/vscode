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
import { insane } from 'vs/base/common/insane/insane';
import { parse } from 'vs/base/common/marshalling';
import { cloneAndChange } from 'vs/base/common/objects';
import { escape } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { renderCodicons, markdownEscapeEscapedCodicons } from 'vs/base/common/codicons';

export interface MarkdownRenderOptions extends FormattedTextRenderOptions {
	codeBlockRenderer?: (modeId: string, value: string) => Promise<string>;
	codeBlockRenderCallback?: () => void;
	latexRenderer?: (value: string) => Promise<{ html: string, styles?: { readonly [key: string]: string | number; } }>;
	latexRendererCallback?: () => void;
}

/**
 * Create html nodes for the given content element.
 */
export function renderMarkdown(markdown: IMarkdownString, renderOptions: MarkdownRenderOptions = {}, markedOptions: marked.MarkedOptions = {}): HTMLElement {
	const element = createElement(renderOptions);

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
			return href; // no uri exists
		}
		let uri = URI.revive(data);
		if (URI.parse(href).toString() === uri.toString()) {
			return href; // no tranformation performed
		}
		if (isDomUri) {
			uri = DOM.asDomUri(uri);
		}
		if (uri.query) {
			uri = uri.with({ query: _uriMassage(uri.query) });
		}
		return uri.toString(true);
	};

	// signal to code-block render that the
	// element has been created
	let signalInnerHTML: () => void;
	const withInnerHTML = new Promise<void>(c => signalInnerHTML = c);

	markedOptions.sanitize = true;
	const renderer = new marked.Renderer(markedOptions);
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
		return `<p>${markdown.supportThemeIcons ? renderCodicons(text) : text}</p>`;
	};

	if (renderOptions.codeBlockRenderer) {
		renderer.code = (code, lang) => {
			const value = renderOptions.codeBlockRenderer!(lang, code);
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

			if (renderOptions.codeBlockRenderCallback) {
				promise.then(renderOptions.codeBlockRenderCallback);
			}

			return `<div class="code" data-code="${id}">${escape(code)}</div>`;
		};
	}

	if (renderOptions.latexRenderer) {
		let latex = (code: string, block: boolean) => {
			const value = renderOptions.latexRenderer!(code);
			// when code-block rendering is async we return sync
			// but update the node with the real result later.
			const id = defaultGenerator.nextId();
			const promise = Promise.all([value, withInnerHTML]).then(values => {
				const strValue = values[0].html;
				const styles = values[0].styles;
				const span = element.querySelector(`span[data-latex="${id}"]`);
				if (span && styles) {
					span.innerHTML = strValue;
					// let fontColor = styles['vscode-editor-foreground'];
					// span.innerHTML = '';
					// var iframe = document.createElement('iframe');
					// span.appendChild(iframe);
					// iframe.setAttribute('frameborder', '0');
					// iframe.contentWindow?.document.open();
					// iframe.contentWindow?.document.write(`<html><style>body {margin: 0px; color: ${fontColor};}</style><body style="position: absolute">${strValue}</body></html>`);
					// iframe.contentWindow?.document.close();
					// iframe.height = iframe.contentWindow?.document.body.offsetHeight + "px";
					// iframe.width = iframe.contentWindow?.document.body.offsetWidth + "px";
				}
			}).catch(err => {
				// ignore
			});

			if (renderOptions.latexRendererCallback) {
				promise.then(renderOptions.latexRendererCallback);
			}

			let className = block ? 'latex-block' : 'latex';

			return `<span class="${className}" data-latex="${id}">${code}</span>`;
		};

		renderer.latex = (code: string) => latex(code, false);
		renderer.latexBlock = (code: string) => latex(code, true);
	}

	const actionHandler = renderOptions.actionHandler;
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

	if (!markedOptions.renderer) {
		markedOptions.renderer = renderer;
	}

	const allowedSchemes = [Schemas.http, Schemas.https, Schemas.mailto, Schemas.data, Schemas.file, Schemas.vscodeRemote, Schemas.vscodeRemoteResource];
	if (markdown.isTrusted) {
		allowedSchemes.push(Schemas.command);
	}

	const renderedMarkdown = marked.parse(
		markdown.supportThemeIcons
			? markdownEscapeEscapedCodicons(markdown.value)
			: markdown.value,
		markedOptions
	);

	element.innerHTML = insane(renderedMarkdown, {
		allowedSchemes,
		allowedTags: [
			'a', 'abbr', 'article', 'b', 'blockquote', 'br', 'caption', 'code', 'del', 'details', 'div', 'em',
			'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark',
			'ol', 'p', 'pre', 'section', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
			'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'input'
		],
		allowedAttributes: {
			'a': ['href', 'name', 'target', 'data-href'],
			'iframe': ['allowfullscreen', 'frameborder', 'src'],
			'img': ['src', 'title', 'alt', 'width', 'height'],
			'div': ['class', 'data-code'],
			'span': ['class', 'data-latex'],
			'input': ['type', 'disabled', 'checked']
		}
	});

	signalInnerHTML!();

	return element;
}
