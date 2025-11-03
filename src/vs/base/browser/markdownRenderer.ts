/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../common/errors.js';
import { escapeDoubleQuotes, IMarkdownString, MarkdownStringTrustedOptions, parseHrefAndDimensions, removeMarkdownEscapes } from '../common/htmlContent.js';
import { markdownEscapeEscapedIcons } from '../common/iconLabels.js';
import { defaultGenerator } from '../common/idGenerator.js';
import { KeyCode } from '../common/keyCodes.js';
import { Lazy } from '../common/lazy.js';
import { DisposableStore, IDisposable } from '../common/lifecycle.js';
import * as marked from '../common/marked/marked.js';
import { parse } from '../common/marshalling.js';
import { FileAccess, Schemas } from '../common/network.js';
import { cloneAndChange } from '../common/objects.js';
import { dirname, resolvePath } from '../common/resources.js';
import { escape } from '../common/strings.js';
import { URI, UriComponents } from '../common/uri.js';
import * as DOM from './dom.js';
import * as domSanitize from './domSanitize.js';
import { convertTagToPlaintext } from './domSanitize.js';
import { StandardKeyboardEvent } from './keyboardEvent.js';
import { StandardMouseEvent } from './mouseEvent.js';
import { renderIcon, renderLabelWithIcons } from './ui/iconLabel/iconLabels.js';

export type MarkdownActionHandler = (linkContent: string, mdStr: IMarkdownString) => void;

/**
 * Options for the rendering of markdown with {@link renderMarkdown}.
 */
export interface MarkdownRenderOptions {
	readonly codeBlockRenderer?: (languageId: string, value: string) => Promise<HTMLElement>;
	readonly codeBlockRendererSync?: (languageId: string, value: string, raw?: string) => HTMLElement;
	readonly asyncRenderCallback?: () => void;

	readonly actionHandler?: MarkdownActionHandler;

	readonly fillInIncompleteTokens?: boolean;

	readonly sanitizerConfig?: MarkdownSanitizerConfig;

	readonly markedOptions?: MarkdownRendererMarkedOptions;
	readonly markedExtensions?: marked.MarkedExtension[];
}

/**
 * Subset of options passed to `Marked` for rendering markdown.
 */
export interface MarkdownRendererMarkedOptions {
	readonly gfm?: boolean;
	readonly breaks?: boolean;
}

export interface MarkdownSanitizerConfig {
	readonly replaceWithPlaintext?: boolean;
	readonly allowedTags?: {
		readonly override: readonly string[];
	};
	readonly allowedAttributes?: {
		readonly override: ReadonlyArray<string | domSanitize.SanitizeAttributeRule>;
	};
	readonly allowedLinkSchemes?: {
		readonly augment: readonly string[];
	};
	readonly remoteImageIsAllowed?: (uri: URI) => boolean;
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
 * Blockquote renderer that processes GitHub-style alert syntax.
 * Transforms blockquotes like "> [!NOTE]" into structured alert markup with icons.
 *
 * Based on GitHub's alert syntax: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
 */
function createAlertBlockquoteRenderer(fallbackRenderer: (this: marked.Renderer, token: marked.Tokens.Blockquote) => string) {
	return function (this: marked.Renderer, token: marked.Tokens.Blockquote): string {
		const { tokens } = token;
		// Check if this blockquote starts with alert syntax [!TYPE]
		const firstToken = tokens[0];
		if (firstToken?.type !== 'paragraph') {
			return fallbackRenderer.call(this, token);
		}

		const paragraphTokens = firstToken.tokens;
		if (!paragraphTokens || paragraphTokens.length === 0) {
			return fallbackRenderer.call(this, token);
		}

		const firstTextToken = paragraphTokens[0];
		if (firstTextToken?.type !== 'text') {
			return fallbackRenderer.call(this, token);
		}

		const pattern = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*?\n*/i;
		const match = firstTextToken.raw.match(pattern);
		if (!match) {
			return fallbackRenderer.call(this, token);
		}

		// Remove the alert marker from the token
		firstTextToken.raw = firstTextToken.raw.replace(pattern, '');
		firstTextToken.text = firstTextToken.text.replace(pattern, '');

		const alertIcons: Record<string, string> = {
			'note': 'info',
			'tip': 'light-bulb',
			'important': 'comment',
			'warning': 'alert',
			'caution': 'stop'
		};

		const type = match[1];
		const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
		const severity = type.toLowerCase();
		const iconHtml = renderIcon({ id: alertIcons[severity] }).outerHTML;

		// Render the remaining content
		const content = this.parser.parse(tokens);

		// Return alert markup with icon and severity (skipping the first 3 characters: `<p>`)
		return `<blockquote data-severity="${severity}"><p><span>${iconHtml}${typeCapitalized}</span>${content.substring(3)}</blockquote>\n`;
	};
}

export interface IRenderedMarkdown extends IDisposable {
	readonly element: HTMLElement;
}

/**
 * Low-level way create a html element from a markdown string.
 *
 * **Note** that for most cases you should be using {@link import('../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js').MarkdownRenderer MarkdownRenderer}
 * which comes with support for pretty code block rendering and which uses the default way of handling links.
 */
export function renderMarkdown(markdown: IMarkdownString, options: MarkdownRenderOptions = {}, target?: HTMLElement): IRenderedMarkdown {
	const disposables = new DisposableStore();
	let isDisposed = false;

	const markedInstance = new marked.Marked(...(options.markedExtensions ?? []));
	const { renderer, codeBlocks, syncCodeBlocks } = createMarkdownRenderer(markedInstance, options, markdown);
	const value = preprocessMarkdownString(markdown);

	let renderedMarkdown: string;
	if (options.fillInIncompleteTokens) {
		// The defaults are applied by parse but not lexer()/parser(), and they need to be present
		const opts: marked.MarkedOptions = {
			...markedInstance.defaults,
			...options.markedOptions,
			renderer
		};
		const tokens = markedInstance.lexer(value, opts);
		const newTokens = fillInIncompleteTokens(tokens);
		renderedMarkdown = markedInstance.parser(newTokens, opts);
	} else {
		renderedMarkdown = markedInstance.parse(value, { ...options?.markedOptions, renderer, async: false });
	}

	// Rewrite theme icons
	if (markdown.supportThemeIcons) {
		const elements = renderLabelWithIcons(renderedMarkdown);
		renderedMarkdown = elements.map(e => typeof e === 'string' ? e : e.outerHTML).join('');
	}

	const renderedContent = document.createElement('div');
	const sanitizerConfig = getDomSanitizerConfig(markdown, options.sanitizerConfig ?? {});
	domSanitize.safeSetInnerHtml(renderedContent, renderedMarkdown, sanitizerConfig);

	// Rewrite links and images before potentially inserting them into the real dom
	rewriteRenderedLinks(markdown, options, renderedContent);

	let outElement: HTMLElement;
	if (target) {
		outElement = target;
		DOM.reset(target, ...renderedContent.children);
	} else {
		outElement = renderedContent;
	}

	if (codeBlocks.length > 0) {
		Promise.all(codeBlocks).then((tuples) => {
			if (isDisposed) {
				return;
			}
			const renderedElements = new Map(tuples);
			const placeholderElements = outElement.querySelectorAll<HTMLDivElement>(`div[data-code]`);
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
		const placeholderElements = outElement.querySelectorAll<HTMLDivElement>(`div[data-code]`);
		for (const placeholderElement of placeholderElements) {
			const renderedElement = renderedElements.get(placeholderElement.dataset['code'] ?? '');
			if (renderedElement) {
				DOM.reset(placeholderElement, renderedElement);
			}
		}
	}

	// Signal size changes for image tags
	if (options.asyncRenderCallback) {
		for (const img of outElement.getElementsByTagName('img')) {
			const listener = disposables.add(DOM.addDisposableListener(img, 'load', () => {
				listener.dispose();
				options.asyncRenderCallback!();
			}));
		}
	}

	// Add event listeners for links
	if (options.actionHandler) {
		const clickCb = (e: PointerEvent) => {
			const mouseEvent = new StandardMouseEvent(DOM.getWindow(outElement), e);
			if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
				return;
			}
			activateLink(markdown, options, mouseEvent);
		};
		disposables.add(DOM.addDisposableListener(outElement, 'click', clickCb));
		disposables.add(DOM.addDisposableListener(outElement, 'auxclick', clickCb));

		disposables.add(DOM.addDisposableListener(outElement, 'keydown', (e) => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (!keyboardEvent.equals(KeyCode.Space) && !keyboardEvent.equals(KeyCode.Enter)) {
				return;
			}
			activateLink(markdown, options, keyboardEvent);
		}));
	}

	// Remove/disable inputs
	for (const input of [...outElement.getElementsByTagName('input')]) {
		if (input.attributes.getNamedItem('type')?.value === 'checkbox') {
			input.setAttribute('disabled', '');
		} else {
			if (options.sanitizerConfig?.replaceWithPlaintext) {
				const replacement = convertTagToPlaintext(input);
				if (replacement) {
					input.parentElement?.replaceChild(replacement, input);
				} else {
					input.remove();
				}
			} else {
				input.remove();
			}
		}
	}

	return {
		element: outElement,
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

			if (options.sanitizerConfig?.remoteImageIsAllowed) {
				const uri = URI.parse(href);
				if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.data && !options.sanitizerConfig.remoteImageIsAllowed(uri)) {
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

function createMarkdownRenderer(marked: marked.Marked, options: MarkdownRenderOptions, markdown: IMarkdownString): { renderer: marked.Renderer; codeBlocks: Promise<[string, HTMLElement]>[]; syncCodeBlocks: [string, HTMLElement][] } {
	const renderer = new marked.Renderer(options.markedOptions);
	renderer.image = defaultMarkedRenderers.image;
	renderer.link = defaultMarkedRenderers.link;
	renderer.paragraph = defaultMarkedRenderers.paragraph;

	if (markdown.supportAlertSyntax) {
		renderer.blockquote = createAlertBlockquoteRenderer(renderer.blockquote);
	}

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
			if (options.sanitizerConfig?.replaceWithPlaintext) {
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

function activateLink(mdStr: IMarkdownString, options: MarkdownRenderOptions, event: StandardMouseEvent | StandardKeyboardEvent): void {
	const target = event.target.closest('a[data-href]');
	if (!DOM.isHTMLElement(target)) {
		return;
	}

	try {
		let href = target.dataset['href'];
		if (href) {
			if (mdStr.baseUri) {
				href = resolveWithBaseUri(URI.from(mdStr.baseUri), href);
			}
			options.actionHandler?.(href, mdStr);
		}
	} catch (err) {
		onUnexpectedError(err);
	} finally {
		event.preventDefault();
	}
}

function uriMassage(markdown: IMarkdownString, part: string): string {
	let data: unknown;
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

type MdStrConfig = {
	readonly isTrusted?: boolean | MarkdownStringTrustedOptions;
	readonly baseUri?: UriComponents;
};

function sanitizeRenderedMarkdown(
	renderedMarkdown: string,
	originalMdStrConfig: MdStrConfig,
	options: MarkdownSanitizerConfig = {},
): TrustedHTML {
	const sanitizerConfig = getDomSanitizerConfig(originalMdStrConfig, options);
	return domSanitize.sanitizeHtml(renderedMarkdown, sanitizerConfig);
}

export const allowedMarkdownHtmlTags = Object.freeze([
	...domSanitize.basicMarkupHtmlTags,
	'input', // Allow inputs for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);

export const allowedMarkdownHtmlAttributes = Object.freeze<Array<string | domSanitize.SanitizeAttributeRule>>([
	'align',
	'autoplay',
	'alt',
	'colspan',
	'controls',
	'draggable',
	'height',
	'href',
	'loop',
	'muted',
	'playsinline',
	'poster',
	'rowspan',
	'src',
	'target',
	'title',
	'type',
	'width',
	'start',

	// Input (For disabled inputs)
	'checked',
	'disabled',
	'value',

	// Custom markdown attributes
	'data-code',
	'data-href',
	'data-severity',

	// Only allow very specific styles
	{
		attributeName: 'style',
		shouldKeep: (element, data) => {
			if (element.tagName === 'SPAN') {
				if (data.attrName === 'style') {
					return /^(color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(background-color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(border-radius:[0-9]+px;)?$/.test(data.attrValue);
				}
			}
			return false;
		}
	},

	// Only allow codicons for classes
	{
		attributeName: 'class',
		shouldKeep: (element, data) => {
			if (element.tagName === 'SPAN') {
				if (data.attrName === 'class') {
					return /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(data.attrValue);
				}
			}
			return false;
		},
	},
]);

function getDomSanitizerConfig(mdStrConfig: MdStrConfig, options: MarkdownSanitizerConfig): domSanitize.DomSanitizerConfig {
	const isTrusted = mdStrConfig.isTrusted ?? false;
	const allowedLinkSchemes = [
		Schemas.http,
		Schemas.https,
		Schemas.mailto,
		Schemas.file,
		Schemas.vscodeFileResource,
		Schemas.vscodeRemote,
		Schemas.vscodeRemoteResource,
		Schemas.vscodeNotebookCell
	];

	if (isTrusted) {
		allowedLinkSchemes.push(Schemas.command);
	}

	if (options.allowedLinkSchemes?.augment) {
		allowedLinkSchemes.push(...options.allowedLinkSchemes.augment);
	}

	return {
		// allowedTags should included everything that markdown renders to.
		// Since we have our own sanitize function for marked, it's possible we missed some tag so let dompurify make sure.
		// HTML tags that can result from markdown are from reading https://spec.commonmark.org/0.29/
		// HTML table tags that can result from markdown are from https://github.github.com/gfm/#tables-extension-
		allowedTags: {
			override: options.allowedTags?.override ?? allowedMarkdownHtmlTags
		},
		allowedAttributes: {
			override: options.allowedAttributes?.override ?? allowedMarkdownHtmlAttributes,
		},
		allowedLinkProtocols: {
			override: allowedLinkSchemes,
		},
		allowRelativeLinkPaths: !!mdStrConfig.baseUri,
		allowedMediaProtocols: {
			override: [
				Schemas.http,
				Schemas.https,
				Schemas.data,
				Schemas.file,
				Schemas.vscodeFileResource,
				Schemas.vscodeRemote,
				Schemas.vscodeRemoteResource,
			]
		},
		allowRelativeMediaPaths: !!mdStrConfig.baseUri,
		replaceWithPlaintext: options.replaceWithPlaintext,
	};
}

/**
 * Renders `str` as plaintext, stripping out Markdown syntax if it's a {@link IMarkdownString}.
 *
 * For example `# Header` would be output as `Header`.
 */
export function renderAsPlaintext(str: IMarkdownString | string, options?: {
	/** Controls if the ``` of code blocks should be preserved in the output or not */
	readonly includeCodeBlocksFences?: boolean;
}) {
	if (typeof str === 'string') {
		return str;
	}

	// values that are too long will freeze the UI
	let value = str.value ?? '';
	if (value.length > 100_000) {
		value = `${value.substr(0, 100_000)}…`;
	}

	const html = marked.parse(value, { async: false, renderer: options?.includeCodeBlocksFences ? plainTextWithCodeBlocksRenderer.value : plainTextRenderer.value });
	return sanitizeRenderedMarkdown(html, { isTrusted: false }, {})
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
			else if (lastLine.match(/(^|\s)\[\w*[^\]]*$/)) {
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

function completeHeading(token: marked.Tokens.Heading, fullRawText: string): marked.TokensList | void {
	if (token.raw.match(/-\s*$/)) {
		return marked.lexer(fullRawText + ' &nbsp;');
	}
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
	}

	const lastToken = tokens.at(-1);
	if (!newTokens && lastToken?.type === 'list') {
		const newListToken = completeListItemPattern(lastToken as marked.Tokens.List);
		if (newListToken) {
			newTokens = [newListToken];
			i = tokens.length - 1;
		}
	}

	if (!newTokens && lastToken?.type === 'paragraph') {
		// Only operates on a single token, because any newline that follows this should break these patterns
		const newToken = completeSingleLinePattern(lastToken as marked.Tokens.Paragraph);
		if (newToken) {
			newTokens = [newToken];
			i = tokens.length - 1;
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

	if (lastToken?.type === 'heading') {
		const completeTokens = completeHeading(lastToken as marked.Tokens.Heading, mergeRawTokenText(tokens));
		if (completeTokens) {
			return completeTokens;
		}
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
	return completeWithString(tokens, ')', false);
}

function completeLinkTargetArg(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '")', false);
}

function completeLinkText(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '](https://microsoft.com)', false);
}

function completeDoublestar(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '**');
}

function completeDoubleUnderscore(tokens: marked.Token): marked.Token {
	return completeWithString(tokens, '__');
}

function completeWithString(tokens: marked.Token[] | marked.Token, closingString: string, shouldTrim = true): marked.Token {
	const mergedRawText = mergeRawTokenText(Array.isArray(tokens) ? tokens : [tokens]);

	// If it was completed correctly, this should be a single token.
	// Expecting either a Paragraph or a List
	const trimmedRawText = shouldTrim ? mergedRawText.trimEnd() : mergedRawText;
	return marked.lexer(trimmedRawText + closingString)[0];
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
