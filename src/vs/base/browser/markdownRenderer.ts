/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../common/errors.js';
import { Event } from '../common/event.js';
import { escapeDoubleQuotes, IMarkdownString, isMarkdownString, MarkdownStringTrustedOptions, parseHrefAndDimensions, removeMarkdownEscapes } from '../common/htmlContent.js';
import { markdownEscapeEscapedIcons } from '../common/iconLabels.js';
import { defaultGenerator } from '../common/idGenerator.js';
import { KeyCode } from '../common/keyCodes.js';
import { Lazy } from '../common/lazy.js';
import { DisposableStore, IDisposable, toDisposable } from '../common/lifecycle.js';
import * as marked from '../common/marked/marked.js';
import { parse } from '../common/marshalling.js';
import { FileAccess, Schemas } from '../common/network.js';
import { cloneAndChange } from '../common/objects.js';
import { dirname, resolvePath } from '../common/resources.js';
import { escape } from '../common/strings.js';
import { URI } from '../common/uri.js';
import * as DOM from './dom.js';
import dompurify from './dompurify/dompurify.js';
import { DomEmitter } from './event.js';
import { createElement, FormattedTextRenderOptions } from './formattedTextRenderer.js';
import { StandardKeyboardEvent } from './keyboardEvent.js';
import { StandardMouseEvent } from './mouseEvent.js';
import { renderLabelWithIcons } from './ui/iconLabel/iconLabels.js';

export interface MarkedOptions extends marked.MarkedOptions {
	baseUrl?: never;
}

export interface MarkdownRenderOptions extends FormattedTextRenderOptions {
	readonly codeBlockRenderer?: (languageId: string, value: string) => Promise<HTMLElement>;
	readonly codeBlockRendererSync?: (languageId: string, value: string, raw?: string) => HTMLElement;
	readonly asyncRenderCallback?: () => void;
	readonly fillInIncompleteTokens?: boolean;
	readonly remoteImageIsAllowed?: (uri: URI) => boolean;
	readonly sanitizerOptions?: ISanitizerOptions;
}

export interface ISanitizerOptions {
	replaceWithPlaintext?: boolean;
	allowedTags?: string[];
}

const defaultMarkedRenderers = Object.freeze({
	image: ({ href, title, text }: marked.Tokens.Image): string => {
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

	paragraph(this: marked.Renderer, { tokens }: marked.Tokens.Paragraph): string {
		return `<p>${this.parser.parseInline(tokens)}</p>`;
	},

	link(this: marked.Renderer, { href, title, tokens }: marked.Tokens.Link): string {
		let text = this.parser.parseInline(tokens);
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

		return `<a href="${href}" title="${title || href}" draggable="false">${text}</a>`;
	},
});

/**
 * Low-level way create a html element from a markdown string.
 *
 * **Note** that for most cases you should be using {@link import('../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js').MarkdownRenderer MarkdownRenderer}
 * which comes with support for pretty code block rendering and which uses the default way of handling links.
 */
export function renderMarkdown(markdown: IMarkdownString, options: MarkdownRenderOptions = {}, markedOptions: Readonly<MarkedOptions> = {}): { element: HTMLElement; dispose: () => void } {
	const disposables = new DisposableStore();
	let isDisposed = false;

	const element = createElement(options);

	const { renderer, codeBlocks, syncCodeBlocks } = createMarkdownRenderer(options, markdown);
	const value = preprocessMarkdownString(markdown);

	let renderedMarkdown: string;
	if (options.fillInIncompleteTokens) {
		// The defaults are applied by parse but not lexer()/parser(), and they need to be present
		const opts: MarkedOptions = {
			...marked.defaults,
			...markedOptions,
			renderer
		};
		const tokens = marked.lexer(value, opts);
		const newTokens = fillInIncompleteTokens(tokens);
		renderedMarkdown = marked.parser(newTokens, opts);
	} else {
		renderedMarkdown = marked.parse(value, { ...markedOptions, renderer, async: false });
	}

	// Rewrite theme icons
	if (markdown.supportThemeIcons) {
		const elements = renderLabelWithIcons(renderedMarkdown);
		renderedMarkdown = elements.map(e => typeof e === 'string' ? e : e.outerHTML).join('');
	}

	const htmlParser = new DOMParser();
	const markdownHtmlDoc = htmlParser.parseFromString(sanitizeRenderedMarkdown({ isTrusted: markdown.isTrusted, ...options.sanitizerOptions }, renderedMarkdown) as unknown as string, 'text/html');

	rewriteRenderedLinks(markdown, options, markdownHtmlDoc.body);

	element.innerHTML = sanitizeRenderedMarkdown({ isTrusted: markdown.isTrusted, ...options.sanitizerOptions }, markdownHtmlDoc.body.innerHTML) as unknown as string;

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
	} else if (syncCodeBlocks.length > 0) {
		const renderedElements = new Map(syncCodeBlocks);
		const placeholderElements = element.querySelectorAll<HTMLDivElement>(`div[data-code]`);
		for (const placeholderElement of placeholderElements) {
			const renderedElement = renderedElements.get(placeholderElement.dataset['code'] ?? '');
			if (renderedElement) {
				DOM.reset(placeholderElement, renderedElement);
			}
		}
	}

	// Signal size changes for image tags
	if (options.asyncRenderCallback) {
		for (const img of element.getElementsByTagName('img')) {
			const listener = disposables.add(DOM.addDisposableListener(img, 'load', () => {
				listener.dispose();
				options.asyncRenderCallback!();
			}));
		}
	}

	// Add event listeners for links
	if (options.actionHandler) {
		const onClick = options.actionHandler.disposables.add(new DomEmitter(element, 'click'));
		const onAuxClick = options.actionHandler.disposables.add(new DomEmitter(element, 'auxclick'));
		options.actionHandler.disposables.add(Event.any(onClick.event, onAuxClick.event)(e => {
			const mouseEvent = new StandardMouseEvent(DOM.getWindow(element), e);
			if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
				return;
			}
			activateLink(markdown, options, mouseEvent);
		}));

		options.actionHandler.disposables.add(DOM.addDisposableListener(element, 'keydown', (e) => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (!keyboardEvent.equals(KeyCode.Space) && !keyboardEvent.equals(KeyCode.Enter)) {
				return;
			}
			activateLink(markdown, options, keyboardEvent);
		}));
	}

	return {
		element,
		dispose: () => {
			isDisposed = true;
			disposables.dispose();
		}
	};
}

function rewriteRenderedLinks(markdown: IMarkdownString, options: MarkdownRenderOptions, root: HTMLElement) {
	for (const el of root.querySelectorAll('img, audio, video, source')) {
		const src = el.getAttribute('src'); // Get the raw 'src' attribute value as text, not the resolved 'src'
		if (src) {
			let href = src;
			try {
				if (markdown.baseUri) { // absolute or relative local path, or file: uri
					href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
				}
			} catch (err) { }

			el.setAttribute('src', massageHref(markdown, href, true));

			if (options.remoteImageIsAllowed) {
				const uri = URI.parse(href);
				if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.data && !options.remoteImageIsAllowed(uri)) {
					el.replaceWith(DOM.$('', undefined, el.outerHTML));
				}
			}
		}
	}

	for (const el of root.querySelectorAll('a')) {
		const href = el.getAttribute('href'); // Get the raw 'href' attribute value as text, not the resolved 'href'
		el.setAttribute('href', ''); // Clear out href. We use the `data-href` for handling clicks instead
		if (!href
			|| /^data:|javascript:/i.test(href)
			|| (/^command:/i.test(href) && !markdown.isTrusted)
			|| /^command:(\/\/\/)?_workbench\.downloadResource/i.test(href)) {
			// drop the link
			el.replaceWith(...el.childNodes);
		} else {
			let resolvedHref = massageHref(markdown, href, false);
			if (markdown.baseUri) {
				resolvedHref = resolveWithBaseUri(URI.from(markdown.baseUri), href);
			}
			el.dataset.href = resolvedHref;
		}
	}
}

function createMarkdownRenderer(options: MarkdownRenderOptions, markdown: IMarkdownString): { renderer: marked.Renderer; codeBlocks: Promise<[string, HTMLElement]>[]; syncCodeBlocks: [string, HTMLElement][] } {
	const renderer = new marked.Renderer();
	renderer.image = defaultMarkedRenderers.image;
	renderer.link = defaultMarkedRenderers.link;
	renderer.paragraph = defaultMarkedRenderers.paragraph;

	// Will collect [id, renderedElement] tuples
	const codeBlocks: Promise<[string, HTMLElement]>[] = [];
	const syncCodeBlocks: [string, HTMLElement][] = [];

	if (options.codeBlockRendererSync) {
		renderer.code = ({ text, lang, raw }: marked.Tokens.Code) => {
			const id = defaultGenerator.nextId();
			const value = options.codeBlockRendererSync!(postProcessCodeBlockLanguageId(lang), text, raw);
			syncCodeBlocks.push([id, value]);
			return `<div class="code" data-code="${id}">${escape(text)}</div>`;
		};
	} else if (options.codeBlockRenderer) {
		renderer.code = ({ text, lang }: marked.Tokens.Code) => {
			const id = defaultGenerator.nextId();
			const value = options.codeBlockRenderer!(postProcessCodeBlockLanguageId(lang), text);
			codeBlocks.push(value.then(element => [id, element]));
			return `<div class="code" data-code="${id}">${escape(text)}</div>`;
		};
	}

	if (!markdown.supportHtml) {
		// Note: we always pass the output through dompurify after this so that we don't rely on
		// marked for real sanitization.
		renderer.html = ({ text }) => {
			if (options.sanitizerOptions?.replaceWithPlaintext) {
				return escape(text);
			}

			const match = markdown.isTrusted ? text.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : undefined;
			return match ? text : '';
		};
	}
	return { renderer, codeBlocks, syncCodeBlocks };
}

function preprocessMarkdownString(markdown: IMarkdownString) {
	let value = markdown.value;

	// values that are too long will freeze the UI
	if (value.length > 100_000) {
		value = `${value.substr(0, 100_000)}…`;
	}

	// escape theme icons
	if (markdown.supportThemeIcons) {
		value = markdownEscapeEscapedIcons(value);
	}

	return value;
}

function activateLink(markdown: IMarkdownString, options: MarkdownRenderOptions, event: StandardMouseEvent | StandardKeyboardEvent): void {
	const target = event.target.closest('a[data-href]');
	if (!DOM.isHTMLElement(target)) {
		return;
	}

	try {
		let href = target.dataset['href'];
		if (href) {
			if (markdown.baseUri) {
				href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
			}
			options.actionHandler!.callback(href, event);
		}
	} catch (err) {
		onUnexpectedError(err);
	} finally {
		event.preventDefault();
	}
}

function uriMassage(markdown: IMarkdownString, part: string): string {
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
}

function massageHref(markdown: IMarkdownString, href: string, isDomUri: boolean): string {
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
		return FileAccess.uriToBrowserUri(uri).toString(true);
	}
	if (!uri) {
		return href;
	}
	if (URI.parse(href).toString() === uri.toString()) {
		return href; // no transformation performed
	}
	if (uri.query) {
		uri = uri.with({ query: uriMassage(markdown, uri.query) });
	}
	return uri.toString();
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

interface IInternalSanitizerOptions extends ISanitizerOptions {
	isTrusted?: boolean | MarkdownStringTrustedOptions;
}

const selfClosingTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

function sanitizeRenderedMarkdown(
	options: IInternalSanitizerOptions,
	renderedMarkdown: string,
): TrustedHTML {
	const { config, allowedSchemes } = getSanitizerOptions(options);
	const store = new DisposableStore();
	store.add(addDompurifyHook('uponSanitizeAttribute', (element, e) => {
		if (e.attrName === 'style' || e.attrName === 'class') {
			if (element.tagName === 'SPAN') {
				if (e.attrName === 'style') {
					e.keepAttr = /^(color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(background-color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(border-radius:[0-9]+px;)?$/.test(e.attrValue);
					return;
				} else if (e.attrName === 'class') {
					e.keepAttr = /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(e.attrValue);
					return;
				}
			}
			e.keepAttr = false;
			return;
		} else if (element.tagName === 'INPUT' && element.attributes.getNamedItem('type')?.value === 'checkbox') {
			if ((e.attrName === 'type' && e.attrValue === 'checkbox') || e.attrName === 'disabled' || e.attrName === 'checked') {
				e.keepAttr = true;
				return;
			}
			e.keepAttr = false;
		}
	}));

	store.add(addDompurifyHook('uponSanitizeElement', (element, e) => {
		if (e.tagName === 'input') {
			if (element.attributes.getNamedItem('type')?.value === 'checkbox') {
				element.setAttribute('disabled', '');
			} else if (!options.replaceWithPlaintext) {
				element.remove();
			}
		}

		if (options.replaceWithPlaintext && !e.allowedTags[e.tagName] && e.tagName !== 'body') {
			if (element.parentElement) {
				let startTagText: string;
				let endTagText: string | undefined;
				if (e.tagName === '#comment') {
					startTagText = `<!--${element.textContent}-->`;
				} else {
					const isSelfClosing = selfClosingTags.includes(e.tagName);
					const attrString = element.attributes.length ?
						' ' + Array.from(element.attributes)
							.map(attr => `${attr.name}="${attr.value}"`)
							.join(' ')
						: '';
					startTagText = `<${e.tagName}${attrString}>`;
					if (!isSelfClosing) {
						endTagText = `</${e.tagName}>`;
					}
				}

				const fragment = document.createDocumentFragment();
				const textNode = element.parentElement.ownerDocument.createTextNode(startTagText);
				fragment.appendChild(textNode);
				const endTagTextNode = endTagText ? element.parentElement.ownerDocument.createTextNode(endTagText) : undefined;
				while (element.firstChild) {
					fragment.appendChild(element.firstChild);
				}

				if (endTagTextNode) {
					fragment.appendChild(endTagTextNode);
				}

				if (element.nodeType === Node.COMMENT_NODE) {
					// Workaround for https://github.com/cure53/DOMPurify/issues/1005
					// The comment will be deleted in the next phase. However if we try to remove it now, it will cause
					// an exception. Instead we insert the text node before the comment.
					element.parentElement.insertBefore(fragment, element);
				} else {
					element.parentElement.replaceChild(fragment, element);
				}
			}
		}
	}));

	store.add(DOM.hookDomPurifyHrefAndSrcSanitizer(allowedSchemes));

	try {
		return dompurify.sanitize(renderedMarkdown, { ...config, RETURN_TRUSTED_TYPE: true });
	} finally {
		store.dispose();
	}
}

export const allowedMarkdownAttr = [
	'align',
	'autoplay',
	'alt',
	'checked',
	'class',
	'colspan',
	'controls',
	'data-code',
	'data-href',
	'disabled',
	'draggable',
	'height',
	'href',
	'loop',
	'muted',
	'playsinline',
	'poster',
	'rowspan',
	'src',
	'style',
	'target',
	'title',
	'type',
	'width',
	'start',
];

function getSanitizerOptions(options: IInternalSanitizerOptions): { config: dompurify.Config; allowedSchemes: string[] } {
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
			ALLOWED_TAGS: options.allowedTags ?? [...DOM.basicMarkupHtmlTags],
			ALLOWED_ATTR: allowedMarkdownAttr,
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
	return isMarkdownString(string) ? renderMarkdownAsPlaintext(string) : string;
}

/**
 * Strips all markdown from `markdown`
 *
 * For example `# Header` would be output as `Header`.
 *
 * @param withCodeBlocks Include the ``` of code blocks as well
 */
export function renderMarkdownAsPlaintext(markdown: IMarkdownString, withCodeBlocks?: boolean) {
	// values that are too long will freeze the UI
	let value = markdown.value ?? '';
	if (value.length > 100_000) {
		value = `${value.substr(0, 100_000)}…`;
	}

	const html = marked.parse(value, { async: false, renderer: withCodeBlocks ? plainTextWithCodeBlocksRenderer.value : plainTextRenderer.value });
	return sanitizeRenderedMarkdown({ isTrusted: false }, html)
		.toString()
		.replace(/&(#\d+|[a-zA-Z]+);/g, m => unescapeInfo.get(m) ?? m)
		.trim();
}

const unescapeInfo = new Map<string, string>([
	['&quot;', '"'],
	['&nbsp;', ' '],
	['&amp;', '&'],
	['&#39;', '\''],
	['&lt;', '<'],
	['&gt;', '>'],
]);

function createPlainTextRenderer(): marked.Renderer {
	const renderer = new marked.Renderer();

	renderer.code = ({ text }: marked.Tokens.Code): string => {
		return escape(text);
	};
	renderer.blockquote = ({ text }: marked.Tokens.Blockquote): string => {
		return text + '\n';
	};
	renderer.html = (_: marked.Tokens.HTML): string => {
		return '';
	};
	renderer.heading = function ({ tokens }: marked.Tokens.Heading): string {
		return this.parser.parseInline(tokens) + '\n';
	};
	renderer.hr = (): string => {
		return '';
	};
	renderer.list = function ({ items }: marked.Tokens.List): string {
		return items.map(x => this.listitem(x)).join('\n') + '\n';
	};
	renderer.listitem = ({ text }: marked.Tokens.ListItem): string => {
		return text + '\n';
	};
	renderer.paragraph = function ({ tokens }: marked.Tokens.Paragraph): string {
		return this.parser.parseInline(tokens) + '\n';
	};
	renderer.table = function ({ header, rows }: marked.Tokens.Table): string {
		return header.map(cell => this.tablecell(cell)).join(' ') + '\n' + rows.map(cells => cells.map(cell => this.tablecell(cell)).join(' ')).join('\n') + '\n';
	};
	renderer.tablerow = ({ text }: marked.Tokens.TableRow): string => {
		return text;
	};
	renderer.tablecell = function ({ tokens }: marked.Tokens.TableCell): string {
		return this.parser.parseInline(tokens);
	};
	renderer.strong = ({ text }: marked.Tokens.Strong): string => {
		return text;
	};
	renderer.em = ({ text }: marked.Tokens.Em): string => {
		return text;
	};
	renderer.codespan = ({ text }: marked.Tokens.Codespan): string => {
		return escape(text);
	};
	renderer.br = (_: marked.Tokens.Br): string => {
		return '\n';
	};
	renderer.del = ({ text }: marked.Tokens.Del): string => {
		return text;
	};
	renderer.image = (_: marked.Tokens.Image): string => {
		return '';
	};
	renderer.text = ({ text }: marked.Tokens.Text): string => {
		return text;
	};
	renderer.link = ({ text }: marked.Tokens.Link): string => {
		return text;
	};
	return renderer;
}
const plainTextRenderer = new Lazy<marked.Renderer>(createPlainTextRenderer);

const plainTextWithCodeBlocksRenderer = new Lazy<marked.Renderer>(() => {
	const renderer = createPlainTextRenderer();
	renderer.code = ({ text }: marked.Tokens.Code): string => {
		return `\n\`\`\`\n${escape(text)}\n\`\`\`\n`;
	};
	return renderer;
});

function mergeRawTokenText(tokens: marked.Token[]): string {
	let mergedTokenText = '';
	tokens.forEach(token => {
		mergedTokenText += token.raw;
	});
	return mergedTokenText;
}

function completeSingleLinePattern(token: marked.Tokens.Text | marked.Tokens.Paragraph): marked.Token | undefined {
	if (!token.tokens) {
		return undefined;
	}

	for (let i = token.tokens.length - 1; i >= 0; i--) {
		const subtoken = token.tokens[i];
		if (subtoken.type === 'text') {
			const lines = subtoken.raw.split('\n');
			const lastLine = lines[lines.length - 1];
			if (lastLine.includes('`')) {
				return completeCodespan(token);
			}

			else if (lastLine.includes('**')) {
				return completeDoublestar(token);
			}

			else if (lastLine.match(/\*\w/)) {
				return completeStar(token);
			}

			else if (lastLine.match(/(^|\s)__\w/)) {
				return completeDoubleUnderscore(token);
			}

			else if (lastLine.match(/(^|\s)_\w/)) {
				return completeUnderscore(token);
			}

			else if (
				// Text with start of link target
				hasLinkTextAndStartOfLinkTarget(lastLine) ||
				// This token doesn't have the link text, eg if it contains other markdown constructs that are in other subtokens.
				// But some preceding token does have an unbalanced [ at least
				hasStartOfLinkTargetAndNoLinkText(lastLine) && token.tokens.slice(0, i).some(t => t.type === 'text' && t.raw.match(/\[[^\]]*$/))
			) {
				const nextTwoSubTokens = token.tokens.slice(i + 1);

				// A markdown link can look like
				// [link text](https://microsoft.com "more text")
				// Where "more text" is a title for the link or an argument to a vscode command link
				if (
					// If the link was parsed as a link, then look for a link token and a text token with a quote
					nextTwoSubTokens[0]?.type === 'link' && nextTwoSubTokens[1]?.type === 'text' && nextTwoSubTokens[1].raw.match(/^ *"[^"]*$/) ||
					// And if the link was not parsed as a link (eg command link), just look for a single quote in this token
					lastLine.match(/^[^"]* +"[^"]*$/)
				) {

					return completeLinkTargetArg(token);
				}
				return completeLinkTarget(token);
			}

			// Contains the start of link text, and no following tokens contain the link target
			else if (lastLine.match(/(^|\s)\[\w*/)) {
				return completeLinkText(token);
			}
		}
	}

	return undefined;
}

function hasLinkTextAndStartOfLinkTarget(str: string): boolean {
	return !!str.match(/(^|\s)\[.*\]\(\w*/);
}

function hasStartOfLinkTargetAndNoLinkText(str: string): boolean {
	return !!str.match(/^[^\[]*\]\([^\)]*$/);
}

function completeListItemPattern(list: marked.Tokens.List): marked.Tokens.List | undefined {
	// Patch up this one list item
	const lastListItem = list.items[list.items.length - 1];
	const lastListSubToken = lastListItem.tokens ? lastListItem.tokens[lastListItem.tokens.length - 1] : undefined;

	/*
	Example list token structures:

	list
		list_item
			text
				text
				codespan
				link
		list_item
			text
			code // Complete indented codeblock
		list_item
			text
			space
			text
				text // Incomplete indented codeblock
		list_item
			text
			list // Nested list
				list_item
					text
						text

	Contrast with paragraph:
	paragraph
		text
		codespan
	*/

	const listEndsInHeading = (list: marked.Tokens.List): boolean => {
		// A list item can be rendered as a heading for some reason when it has a subitem where we haven't rendered the text yet like this:
		// 1. list item
		//    -
		const lastItem = list.items.at(-1);
		const lastToken = lastItem?.tokens.at(-1);
		return lastToken?.type === 'heading' || lastToken?.type === 'list' && listEndsInHeading(lastToken as marked.Tokens.List);
	};

	let newToken: marked.Token | undefined;
	if (lastListSubToken?.type === 'text' && !('inRawBlock' in lastListItem)) { // Why does Tag have a type of 'text'
		newToken = completeSingleLinePattern(lastListSubToken as marked.Tokens.Text);
	} else if (listEndsInHeading(list)) {
		const newList = marked.lexer(list.raw.trim() + ' &nbsp;')[0] as marked.Tokens.List;
		if (newList.type !== 'list') {
			// Something went wrong
			return;
		}
		return newList;
	}

	if (!newToken || newToken.type !== 'paragraph') { // 'text' item inside the list item turns into paragraph
		// Nothing to fix, or not a pattern we were expecting
		return;
	}

	const previousListItemsText = mergeRawTokenText(list.items.slice(0, -1));

	// Grabbing the `- ` or `1. ` or `* ` off the list item because I can't find a better way to do this
	const lastListItemLead = lastListItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)?.[0];
	if (!lastListItemLead) {
		// Is badly formatted
		return;
	}

	const newListItemText = lastListItemLead +
		mergeRawTokenText(lastListItem.tokens.slice(0, -1)) +
		newToken.raw;

	const newList = marked.lexer(previousListItemsText + newListItemText)[0] as marked.Tokens.List;
	if (newList.type !== 'list') {
		// Something went wrong
		return;
	}

	return newList;
}

const maxIncompleteTokensFixRounds = 3;
export function fillInIncompleteTokens(tokens: marked.TokensList): marked.TokensList {
	for (let i = 0; i < maxIncompleteTokensFixRounds; i++) {
		const newTokens = fillInIncompleteTokensOnce(tokens);
		if (newTokens) {
			tokens = newTokens;
		} else {
			break;
		}
	}

	return tokens;
}

function fillInIncompleteTokensOnce(tokens: marked.TokensList): marked.TokensList | null {
	let i: number;
	let newTokens: marked.Token[] | undefined;
	for (i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		if (token.type === 'paragraph' && token.raw.match(/(\n|^)\|/)) {
			newTokens = completeTable(tokens.slice(i));
			break;
		}

		if (i === tokens.length - 1 && token.type === 'list') {
			const newListToken = completeListItemPattern(token as marked.Tokens.List);
			if (newListToken) {
				newTokens = [newListToken];
				break;
			}
		}

		if (i === tokens.length - 1 && token.type === 'paragraph') {
			// Only operates on a single token, because any newline that follows this should break these patterns
			const newToken = completeSingleLinePattern(token as marked.Tokens.Paragraph);
			if (newToken) {
				newTokens = [newToken];
				break;
			}
		}
	}

	if (newTokens) {
		const newTokensList = [
			...tokens.slice(0, i),
			...newTokens
		];
		(newTokensList as marked.TokensList).links = tokens.links;
		return newTokensList as marked.TokensList;
	}

	return null;
}


function completeCodespan(token: marked.Token): marked.Token {
	return completeWithString(token, '`');
}

function completeStar(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '*');
}

function completeUnderscore(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '_');
}

function completeLinkTarget(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, ')');
}

function completeLinkTargetArg(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '")');
}

function completeLinkText(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '](https://microsoft.com)');
}

function completeDoublestar(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '**');
}

function completeDoubleUnderscore(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '__');
}

function completeWithString(tokens: marked.Token[] | marked.Token, closingString: string): marked.Token {
	const mergedRawText = mergeRawTokenText(Array.isArray(tokens) ? tokens : [tokens]);

	// If it was completed correctly, this should be a single token.
	// Expecting either a Paragraph or a List
	return marked.lexer(mergedRawText + closingString)[0] as marked.Token;
}

function completeTable(tokens: marked.Token[]): marked.Token[] | undefined {
	const mergedRawText = mergeRawTokenText(tokens);
	const lines = mergedRawText.split('\n');

	let numCols: number | undefined; // The number of line1 col headers
	let hasSeparatorRow = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (typeof numCols === 'undefined' && line.match(/^\s*\|/)) {
			const line1Matches = line.match(/(\|[^\|]+)(?=\||$)/g);
			if (line1Matches) {
				numCols = line1Matches.length;
			}
		} else if (typeof numCols === 'number') {
			if (line.match(/^\s*\|/)) {
				if (i !== lines.length - 1) {
					// We got the line1 header row, and the line2 separator row, but there are more lines, and it wasn't parsed as a table!
					// That's strange and means that the table is probably malformed in the source, so I won't try to patch it up.
					return undefined;
				}

				// Got a line2 separator row- partial or complete, doesn't matter, we'll replace it with a correct one
				hasSeparatorRow = true;
			} else {
				// The line after the header row isn't a valid separator row, so the table is malformed, don't fix it up
				return undefined;
			}
		}
	}

	if (typeof numCols === 'number' && numCols > 0) {
		const prefixText = hasSeparatorRow ? lines.slice(0, -1).join('\n') : mergedRawText;
		const line1EndsInPipe = !!prefixText.match(/\|\s*$/);
		const newRawText = prefixText + (line1EndsInPipe ? '' : '|') + `\n|${' --- |'.repeat(numCols)}`;
		return marked.lexer(newRawText);
	}

	return undefined;
}

function addDompurifyHook(
	hook: 'uponSanitizeElement',
	cb: (currentNode: Element, data: dompurify.SanitizeElementHookEvent, config: dompurify.Config) => void,
): IDisposable;
function addDompurifyHook(
	hook: 'uponSanitizeAttribute',
	cb: (currentNode: Element, data: dompurify.SanitizeAttributeHookEvent, config: dompurify.Config) => void,
): IDisposable;
function addDompurifyHook(hook: 'uponSanitizeElement' | 'uponSanitizeAttribute', cb: any): IDisposable {
	dompurify.addHook(hook, cb);
	return toDisposable(() => dompurify.removeHook(hook));
}
