/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import * as dompurify from 'vs/base/browser/dompurify/dompurify';
import { DomEmitter } from 'vs/base/browser/event';
import { createElement, FormattedTextRenderOptions } from 'vs/base/browser/formattedTextRenderer';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { IMarkdownString, escapeDoubleQuotes, parseHrefAndDimensions, removeMarkdownEscapes } from 'vs/base/common/htmlContent';
import { markdownEscapeEscapedIcons } from 'vs/base/common/iconLabels';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { marked } from 'vs/base/common/marked/marked';
import { parse } from 'vs/base/common/marshalling';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { cloneAndChange } from 'vs/base/common/objects';
import { dirname, resolvePath } from 'vs/base/common/resources';
import { escape } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export interface MarkedOptions extends marked.MarkedOptions {
	baseUrl?: never;
}

export interface MarkdownRenderOptions extends FormattedTextRenderOptions {
	readonly codeBlockRenderer?: (languageId: string, value: string) => Promise<HTMLElement>;
	readonly asyncRenderCallback?: () => void;
}

const defaultMarkedRenderers = Object.freeze({
	image: (href: string | null, title: string | null, text: string): string => {
		let dimensions: string[] = [];
		let attributes: string[] = [];
		if (href) {
			({ href, dimensions } = parseHrefAndDimensions(href));
			attributes.push(`src="${escapeDoubleQuotes(href)}"`);
		}
		if (text) {
			attributes.push(`alt="${escapeDoubleQuotes(text)}"`);
		}
		if (title) {
			attributes.push(`title="${escapeDoubleQuotes(title)}"`);
		}
		if (dimensions.length) {
			attributes = attributes.concat(dimensions);
		}
		return '<img ' + attributes.join(' ') + '>';
	},

	paragraph: (text: string): string => {
		return `<p>${text}</p>`;
	},

	link: (href: string | null, title: string | null, text: string): string => {
		if (typeof href !== 'string') {
			return '';
		}

		// Remove markdown escapes. Workaround for https://github.com/chjj/marked/issues/829
		if (href === text) { // raw link case
			text = removeMarkdownEscapes(text);
		}

		title = typeof title === 'string' ? escapeDoubleQuotes(removeMarkdownEscapes(title)) : '';
		href = removeMarkdownEscapes(href);

		// HTML Encode href
		href = href.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
		return `<a href="${href}" title="${title || href}">${text}</a>`;
	},
});

/**
 * Low-level way create a html element from a markdown string.
 *
 * **Note** that for most cases you should be using [`MarkdownRenderer`](./src/vs/editor/contrib/markdownRenderer/browser/markdownRenderer.ts)
 * which comes with support for pretty code block rendering and which uses the default way of handling links.
 */
export function renderMarkdown(markdown: IMarkdownString, options: MarkdownRenderOptions = {}, markedOptions: MarkedOptions = {}): { element: HTMLElement; dispose: () => void } {
	const disposables = new DisposableStore();
	let isDisposed = false;

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
		let uri = URI.revive(data);
		if (isDomUri) {
			if (href.startsWith(Schemas.data + ':')) {
				return href;
			}
			if (!uri) {
				uri = URI.parse(href);
			}
			// this URI will end up as "src"-attribute of a dom node
			// and because of that special rewriting needs to be done
			// so that the URI uses a protocol that's understood by
			// browsers (like http or https)
			return FileAccess.asBrowserUri(uri).toString(true);
		}
		if (!uri) {
			return href;
		}
		if (URI.parse(href).toString() === uri.toString()) {
			return href; // no transformation performed
		}
		if (uri.query) {
			uri = uri.with({ query: _uriMassage(uri.query) });
		}
		return uri.toString();
	};

	const renderer = new marked.Renderer();
	renderer.image = defaultMarkedRenderers.image;
	renderer.link = defaultMarkedRenderers.link;
	renderer.paragraph = defaultMarkedRenderers.paragraph;

	// Will collect [id, renderedElement] tuples
	const codeBlocks: Promise<[string, HTMLElement]>[] = [];

	if (options.codeBlockRenderer) {
		renderer.code = (code, lang) => {
			const id = defaultGenerator.nextId();
			const value = options.codeBlockRenderer!(postProcessCodeBlockLanguageId(lang), code);
			codeBlocks.push(value.then(element => [id, element]));
			return `<div class="code" data-code="${id}">${escape(code)}</div>`;
		};
	}

	if (options.actionHandler) {
		const onClick = options.actionHandler.disposables.add(new DomEmitter(element, 'click'));
		const onAuxClick = options.actionHandler.disposables.add(new DomEmitter(element, 'auxclick'));
		options.actionHandler.disposables.add(Event.any(onClick.event, onAuxClick.event)(e => {
			const mouseEvent = new StandardMouseEvent(e);
			if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
				return;
			}

			let target: HTMLElement | null = mouseEvent.target;
			if (target.tagName !== 'A') {
				target = target.parentElement;
				if (!target || target.tagName !== 'A') {
					return;
				}
			}
			try {
				let href = target.dataset['href'];
				if (href) {
					if (markdown.baseUri) {
						href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
					}
					options.actionHandler!.callback(href, mouseEvent);
				}
			} catch (err) {
				onUnexpectedError(err);
			} finally {
				mouseEvent.preventDefault();
			}
		}));
	}

	if (!markdown.supportHtml) {
		// TODO: Can we deprecated this in favor of 'supportHtml'?

		// Use our own sanitizer so that we can let through only spans.
		// Otherwise, we'd be letting all html be rendered.
		// If we want to allow markdown permitted tags, then we can delete sanitizer and sanitize.
		// We always pass the output through dompurify after this so that we don't rely on
		// marked for sanitization.
		markedOptions.sanitizer = (html: string): string => {
			const match = markdown.isTrusted ? html.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : undefined;
			return match ? html : '';
		};
		markedOptions.sanitize = true;
		markedOptions.silent = true;
	}

	markedOptions.renderer = renderer;

	// values that are too long will freeze the UI
	let value = markdown.value ?? '';
	if (value.length > 100_000) {
		value = `${value.substr(0, 100_000)}…`;
	}
	// escape theme icons
	if (markdown.supportThemeIcons) {
		value = markdownEscapeEscapedIcons(value);
	}

	let renderedMarkdown = marked.parse(value, markedOptions);

	// Rewrite theme icons
	if (markdown.supportThemeIcons) {
		const elements = renderLabelWithIcons(renderedMarkdown);
		renderedMarkdown = elements.map(e => typeof e === 'string' ? e : e.outerHTML).join('');
	}

	const htmlParser = new DOMParser();
	const markdownHtmlDoc = htmlParser.parseFromString(sanitizeRenderedMarkdown(markdown, renderedMarkdown) as unknown as string, 'text/html');

	markdownHtmlDoc.body.querySelectorAll('img')
		.forEach(img => {
			const src = img.getAttribute('src'); // Get the raw 'src' attribute value as text, not the resolved 'src'
			if (src) {
				let href = src;
				try {
					if (markdown.baseUri) { // absolute or relative local path, or file: uri
						href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
					}
				} catch (err) { }

				img.src = _href(href, true);
			}
		});

	markdownHtmlDoc.body.querySelectorAll('a')
		.forEach(a => {
			const href = a.getAttribute('href'); // Get the raw 'href' attribute value as text, not the resolved 'href'
			a.setAttribute('href', ''); // Clear out href. We use the `data-href` for handling clicks instead
			if (
				!href
				|| /^data:|javascript:/i.test(href)
				|| (/^command:/i.test(href) && !markdown.isTrusted)
				|| /^command:(\/\/\/)?_workbench\.downloadResource/i.test(href)
			) {
				// drop the link
				a.replaceWith(...a.childNodes);
			} else {
				let resolvedHref = _href(href, false);
				if (markdown.baseUri) {
					resolvedHref = resolveWithBaseUri(URI.from(markdown.baseUri), href);
				}
				a.dataset.href = resolvedHref;
			}
		});

	element.innerHTML = sanitizeRenderedMarkdown(markdown, markdownHtmlDoc.body.innerHTML) as unknown as string;

	if (codeBlocks.length > 0) {
		Promise.all(codeBlocks).then((tuples) => {
			if (isDisposed) {
				return;
			}
			const renderedElements = new Map(tuples);
			const placeholderElements = element.querySelectorAll<HTMLDivElement>(`div[data-code]`);
			for (const placeholderElement of placeholderElements) {
				const renderedElement = renderedElements.get(placeholderElement.dataset['code'] ?? '');
				if (renderedElement) {
					DOM.reset(placeholderElement, renderedElement);
				}
			}
			options.asyncRenderCallback?.();
		});
	}

	// signal size changes for image tags
	if (options.asyncRenderCallback) {
		for (const img of element.getElementsByTagName('img')) {
			const listener = disposables.add(DOM.addDisposableListener(img, 'load', () => {
				listener.dispose();
				options.asyncRenderCallback!();
			}));
		}
	}

	return {
		element,
		dispose: () => {
			isDisposed = true;
			disposables.dispose();
		}
	};
}

function postProcessCodeBlockLanguageId(lang: string | undefined): string {
	if (!lang) {
		return '';
	}

	const parts = lang.split(/[\s+|:|,|\{|\?]/, 1);
	if (parts.length) {
		return parts[0];
	}
	return lang;
}

function resolveWithBaseUri(baseUri: URI, href: string): string {
	const hasScheme = /^\w[\w\d+.-]*:/.test(href);
	if (hasScheme) {
		return href;
	}

	if (baseUri.path.endsWith('/')) {
		return resolvePath(baseUri, href).toString();
	} else {
		return resolvePath(dirname(baseUri), href).toString();
	}
}

function sanitizeRenderedMarkdown(
	options: { isTrusted?: boolean },
	renderedMarkdown: string,
): TrustedHTML {
	const { config, allowedSchemes } = getSanitizerOptions(options);
	dompurify.addHook('uponSanitizeAttribute', (element, e) => {
		if (e.attrName === 'style' || e.attrName === 'class') {
			if (element.tagName === 'SPAN') {
				if (e.attrName === 'style') {
					e.keepAttr = /^(color\:#[0-9a-fA-F]+;)?(background-color\:#[0-9a-fA-F]+;)?$/.test(e.attrValue);
					return;
				} else if (e.attrName === 'class') {
					e.keepAttr = /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(e.attrValue);
					return;
				}
			}
			e.keepAttr = false;
			return;
		}
	});

	const hook = DOM.hookDomPurifyHrefAndSrcSanitizer(allowedSchemes);

	try {
		return dompurify.sanitize(renderedMarkdown, { ...config, RETURN_TRUSTED_TYPE: true });
	} finally {
		dompurify.removeHook('uponSanitizeAttribute');
		hook.dispose();
	}
}

function getSanitizerOptions(options: { readonly isTrusted?: boolean }): { config: dompurify.Config; allowedSchemes: string[] } {
	const allowedSchemes = [
		Schemas.http,
		Schemas.https,
		Schemas.mailto,
		Schemas.data,
		Schemas.file,
		Schemas.vscodeFileResource,
		Schemas.vscodeRemote,
		Schemas.vscodeRemoteResource,
	];

	if (options.isTrusted) {
		allowedSchemes.push(Schemas.command);
	}

	return {
		config: {
			// allowedTags should included everything that markdown renders to.
			// Since we have our own sanitize function for marked, it's possible we missed some tag so let dompurify make sure.
			// HTML tags that can result from markdown are from reading https://spec.commonmark.org/0.29/
			// HTML table tags that can result from markdown are from https://github.github.com/gfm/#tables-extension-
			ALLOWED_TAGS: ['ul', 'li', 'p', 'b', 'i', 'code', 'blockquote', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'em', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'del', 'a', 'strong', 'br', 'img', 'span'],
			ALLOWED_ATTR: ['href', 'data-href', 'target', 'title', 'src', 'alt', 'class', 'style', 'data-code', 'width', 'height', 'align'],
			ALLOW_UNKNOWN_PROTOCOLS: true,
		},
		allowedSchemes
	};
}

/**
 * Strips all markdown from `string`, if it's an IMarkdownString. For example
 * `# Header` would be output as `Header`. If it's not, the string is returned.
 */
export function renderStringAsPlaintext(string: IMarkdownString | string) {
	return typeof string === 'string' ? string : renderMarkdownAsPlaintext(string);
}

/**
 * Strips all markdown from `markdown`. For example `# Header` would be output as `Header`.
 */
export function renderMarkdownAsPlaintext(markdown: IMarkdownString) {
	// values that are too long will freeze the UI
	let value = markdown.value ?? '';
	if (value.length > 100_000) {
		value = `${value.substr(0, 100_000)}…`;
	}

	const html = marked.parse(value, { renderer: plainTextRenderer.getValue() }).replace(/&(#\d+|[a-zA-Z]+);/g, m => unescapeInfo.get(m) ?? m);

	return sanitizeRenderedMarkdown({ isTrusted: false }, html).toString();
}

const unescapeInfo = new Map<string, string>([
	['&quot;', '"'],
	['&nbsp;', ' '],
	['&amp;', '&'],
	['&#39;', '\''],
	['&lt;', '<'],
	['&gt;', '>'],
]);

const plainTextRenderer = new Lazy<marked.Renderer>(() => {
	const renderer = new marked.Renderer();

	renderer.code = (code: string): string => {
		return code;
	};
	renderer.blockquote = (quote: string): string => {
		return quote;
	};
	renderer.html = (_html: string): string => {
		return '';
	};
	renderer.heading = (text: string, _level: 1 | 2 | 3 | 4 | 5 | 6, _raw: string): string => {
		return text + '\n';
	};
	renderer.hr = (): string => {
		return '';
	};
	renderer.list = (body: string, _ordered: boolean): string => {
		return body;
	};
	renderer.listitem = (text: string): string => {
		return text + '\n';
	};
	renderer.paragraph = (text: string): string => {
		return text + '\n';
	};
	renderer.table = (header: string, body: string): string => {
		return header + body + '\n';
	};
	renderer.tablerow = (content: string): string => {
		return content;
	};
	renderer.tablecell = (content: string, _flags: {
		header: boolean;
		align: 'center' | 'left' | 'right' | null;
	}): string => {
		return content + ' ';
	};
	renderer.strong = (text: string): string => {
		return text;
	};
	renderer.em = (text: string): string => {
		return text;
	};
	renderer.codespan = (code: string): string => {
		return code;
	};
	renderer.br = (): string => {
		return '\n';
	};
	renderer.del = (text: string): string => {
		return text;
	};
	renderer.image = (_href: string, _title: string, _text: string): string => {
		return '';
	};
	renderer.text = (text: string): string => {
		return text;
	};
	renderer.link = (_href: string, _title: string, text: string): string => {
		return text;
	};
	return renderer;
});
