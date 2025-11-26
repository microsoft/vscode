/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IMarkdownRenderer, IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import product from '../../../../platform/product/common/product.js';

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
	constructor(
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) { }

	render(markdown: IMarkdownString, options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown {
		options = {
			...options,
			sanitizerConfig: {
				replaceWithPlaintext: true,
				allowedTags: {
					override: allowedChatMarkdownHtmlTags,
				},
				...options?.sanitizerConfig,
				allowedLinkSchemes: { augment: [product.urlProtocol] },
				remoteImageIsAllowed: (_uri) => false,
			}
		};

		const mdWithBody: IMarkdownString = (markdown && markdown.supportHtml) ?
			{
				...markdown,

				// dompurify uses DOMParser, which strips leading comments. Wrapping it all in 'body' prevents this.
				// The \n\n prevents marked.js from parsing the body contents as just text in an 'html' token, instead of actual markdown.
				value: `<body>\n\n${markdown.value}</body>`,
			}
			: markdown;
		const result = this.markdownRendererService.render(mdWithBody, options, outElement);

		// In some cases, the renderer can return top level text nodes  but our CSS expects
		// all text to be in a <p> for margin to be applied properly.
		// So just normalize it.
		result.element.normalize();
		for (const child of result.element.childNodes) {
			if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
				child.replaceWith($('p', undefined, child.textContent));
			}
		}
		return result;
	}
}
