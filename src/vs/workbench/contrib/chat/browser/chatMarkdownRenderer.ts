/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownRenderOptions, MarkedOptions } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IMarkdownRendererOptions, IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITrustedDomainService } from 'vs/workbench/contrib/url/browser/trustedDomainService';

const allowedHtmlTags = [
	'b',
	'blockquote',
	'br',
	'code',
	'em',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'li',
	'ol',
	'p',
	'pre',
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
];

/**
 * This wraps the MarkdownRenderer and applies sanitizer options needed for Chat.
 */
export class ChatMarkdownRenderer extends MarkdownRenderer {
	constructor(
		options: IMarkdownRendererOptions | undefined,
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
		@ITrustedDomainService private readonly trustedDomainService: ITrustedDomainService,
	) {
		super(options ?? {}, languageService, openerService);
	}

	override render(markdown: IMarkdownString | undefined, options?: MarkdownRenderOptions, markedOptions?: MarkedOptions): IMarkdownRenderResult {
		options = {
			...options,
			remoteImageIsAllowed: (uri) => this.trustedDomainService.isValid(uri),
			sanitizerOptions: {
				replaceWithPlaintext: true,
				allowedTags: allowedHtmlTags,
			}
		};

		const mdWithBody: IMarkdownString | undefined = (markdown && markdown.supportHtml) ?
			{
				...markdown,

				// dompurify uses DOMParser, which strips leading comments. Wrapping it all in 'body' prevents this.
				// The \n\n prevents marked.js from parsing the body contents as just text in an 'html' token, instead of actual markdown.
				value: `<body>\n\n${markdown.value}</body>`,
			}
			: markdown;
		return super.render(mdWithBody, options, markedOptions);
	}
}
