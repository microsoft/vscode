/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, isHTMLElement } from '../../../../../base/browser/dom.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../base/browser/markdownRenderer.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRenderer, IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { Schemas } from '../../../../../base/common/network.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';

const _remoteImageDisallowed = () => false;

export interface IChatMarkdownRenderOptions extends MarkdownRenderOptions {
	readonly chatFindText?: string;
	readonly currentChatFindMatchIndex?: number;
}

export const allowedChatMarkdownHtmlTags = Object.freeze([
	'b',
	'blockquote',
	'br',
	'code',
	'del',
	'em',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'ins',
	'li',
	'ol',
	'p',
	'pre',
	's',
	'strong',
	'sub',
	'sup',
	'table',
	'tbody',
	'td',
	'th',
	'thead',
	'tr',
	'ul',
	'a',
	'img',

	// TODO@roblourens when we sanitize attributes in markdown source, we can ban these elements at that step. microsoft/vscode-copilot#5091
	// Not in the official list, but used for codicons and other vscode markdown extensions
	'span',
	'div',

	'input', // Allowed for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);

/**
 * This wraps the MarkdownRenderer and applies sanitizer options needed for chat content.
 */
export class ChatContentMarkdownRenderer implements IMarkdownRenderer {
	private static readonly highlightedTagNameBlacklist = new Set(['CODE', 'KBD', 'MARK', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA']);
	private getChatFindText: (() => string | undefined) | undefined;

	constructor(
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) { }

	setChatFindTextAccessor(getChatFindText: (() => string | undefined) | undefined): void {
		this.getChatFindText = getChatFindText;
	}

	render(markdown: IMarkdownString, options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown {
		const chatOptions = options as IChatMarkdownRenderOptions | undefined;
		const existingAsyncRenderCallback = options?.asyncRenderCallback;
		const renderedElementRef: { current: HTMLElement | undefined } = { current: undefined };
		const applyHighlights = (container: HTMLElement) => {
			highlightChatFindMatches(container, chatOptions?.chatFindText ?? this.getChatFindText?.(), chatOptions?.currentChatFindMatchIndex);
		};
		options = {
			...options,
			asyncRenderCallback: () => {
				if (renderedElementRef.current) {
					applyHighlights(renderedElementRef.current);
				}
				existingAsyncRenderCallback?.();
			},
			sanitizerConfig: {
				replaceWithPlaintext: true,
				allowedTags: {
					override: allowedChatMarkdownHtmlTags,
				},
				...options?.sanitizerConfig,
				allowedLinkSchemes: { augment: [product.urlProtocol, 'copilot-skill', Schemas.vscodeBrowser, AGENT_HOST_SCHEME] },
				remoteImageIsAllowed: _remoteImageDisallowed,
			}
		};

		const mdWithBody: IMarkdownString = (markdown && markdown.supportHtml) ?
			{
				...markdown,

				// dompurify uses DOMParser, which strips leading comments. Wrapping it all in 'body' prevents this.
				// The \n\n prevents marked.js from parsing the body contents as just text in an 'html' token, instead of actual markdown.
				value: `<body>\n\n${markdown.value}\n\n</body>`,
			}
			: markdown;
		const result = this.markdownRendererService.render(mdWithBody, options, outElement);
		renderedElementRef.current = result.element;

		// In some cases, the renderer can return top level text nodes  but our CSS expects
		// all text to be in a <p> for margin to be applied properly.
		// So just normalize it.
		result.element.normalize();
		for (const child of result.element.childNodes) {
			if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
				child.replaceWith($('p', undefined, child.textContent));
			}
		}
		applyHighlights(result.element);
		return this.attachCustomHover(result);
	}

	private attachCustomHover(result: IRenderedMarkdown): IRenderedMarkdown {
		const store = new DisposableStore();
		const ownerDocument = result.element.ownerDocument;
		const nodeFilter = ownerDocument.defaultView?.NodeFilter ?? NodeFilter;
		const walker = ownerDocument.createTreeWalker(result.element, nodeFilter.SHOW_ELEMENT, {
			acceptNode: node => isHTMLElement(node) && node.tagName === 'A' ? nodeFilter.FILTER_ACCEPT : nodeFilter.FILTER_SKIP
		});

		while (walker.nextNode()) {
			const element = walker.currentNode as HTMLElement;
			if (element.title) {
				const title = element.title;
				element.title = '';
				store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, title));
			}
		}

		return {
			element: result.element,
			dispose: () => {
				result.dispose();
				store.dispose();
			}
		};
	}
}

export function countChatFindMatchesInText(text: string, searchText: string | undefined): number {
	const needle = searchText?.trim().toLocaleLowerCase();
	if (!needle) {
		return 0;
	}

	const haystack = text.toLocaleLowerCase();
	let count = 0;
	let matchIndex = haystack.indexOf(needle);
	while (matchIndex !== -1) {
		count++;
		matchIndex = haystack.indexOf(needle, matchIndex + needle.length);
	}

	return count;
}

export function highlightChatFindMatches(container: HTMLElement, searchText: string | undefined, currentMatch: boolean | number = false): void {
	clearChatFindMatches(container);

	const needle = searchText?.trim().toLocaleLowerCase();
	if (!needle) {
		return;
	}

	const currentMatchIndex = typeof currentMatch === 'number'
		? currentMatch
		: currentMatch ? 0 : undefined;

	const ownerDocument = container.ownerDocument;
	const nodeFilter = ownerDocument.defaultView?.NodeFilter ?? NodeFilter;
	const walker = ownerDocument.createTreeWalker(container, nodeFilter.SHOW_TEXT, {
		acceptNode: node => {
			if (!node.textContent?.trim()) {
				return nodeFilter.FILTER_REJECT;
			}

			const parent = node.parentElement;
			if (!parent) {
				return nodeFilter.FILTER_REJECT;
			}

			if (ChatContentMarkdownRenderer.highlightedTagNameBlacklist.has(parent.tagName) || parent.closest('code, pre, .monaco-editor, .codicon, .chat-find-match')) {
				return nodeFilter.FILTER_REJECT;
			}

			return node.textContent.toLocaleLowerCase().includes(needle) ? nodeFilter.FILTER_ACCEPT : nodeFilter.FILTER_REJECT;
		}
	});

	const textNodes: Text[] = [];
	while (walker.nextNode()) {
		textNodes.push(walker.currentNode as Text);
	}

	let renderedMatchIndex = 0;
	for (const textNode of textNodes) {
		const text = textNode.textContent;
		if (!text) {
			continue;
		}

		const fragment = ownerDocument.createDocumentFragment();
		const lowerText = text.toLocaleLowerCase();
		let lastIndex = 0;
		let matchIndex = lowerText.indexOf(needle);

		while (matchIndex !== -1) {
			if (matchIndex > lastIndex) {
				fragment.append(ownerDocument.createTextNode(text.slice(lastIndex, matchIndex)));
			}

			const mark = ownerDocument.createElement('span');
			mark.className = 'chat-find-match';
			if (currentMatchIndex === renderedMatchIndex) {
				mark.classList.add('chat-find-current-match');
			}
			mark.textContent = text.slice(matchIndex, matchIndex + needle.length);
			fragment.append(mark);
			renderedMatchIndex++;
			lastIndex = matchIndex + needle.length;
			matchIndex = lowerText.indexOf(needle, lastIndex);
		}

		if (lastIndex < text.length) {
			fragment.append(ownerDocument.createTextNode(text.slice(lastIndex)));
		}

		textNode.replaceWith(fragment);
	}
}

function clearChatFindMatches(container: HTMLElement): void {
	const ownerDocument = container.ownerDocument;
	const nodeFilter = ownerDocument.defaultView?.NodeFilter ?? NodeFilter;
	const matches: HTMLElement[] = [];
	const walker = ownerDocument.createTreeWalker(container, nodeFilter.SHOW_ELEMENT, {
		acceptNode: node => isHTMLElement(node) && node.classList.contains('chat-find-match') ? nodeFilter.FILTER_ACCEPT : nodeFilter.FILTER_SKIP
	});

	while (walker.nextNode()) {
		matches.push(walker.currentNode as HTMLElement);
	}

	for (const match of matches) {
		if (match.isConnected) {
			match.replaceWith(...Array.from(match.childNodes));
		}
	}

	container.normalize();
}
