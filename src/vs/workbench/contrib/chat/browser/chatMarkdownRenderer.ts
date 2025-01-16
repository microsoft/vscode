/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownRenderOptions, MarkedOptions } from '../../../../base/browser/markdownRenderer.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IMarkdownRendererOptions, IMarkdownRenderResult, MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../files/browser/fileConstants.js';
import { ITrustedDomainService } from '../../url/browser/trustedDomainService.js';

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
		@IHoverService private readonly hoverService: IHoverService,
		@IFileService private readonly fileService: IFileService,
		@ICommandService private readonly commandService: ICommandService,
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
		const result = super.render(mdWithBody, options, markedOptions);
		return this.attachCustomHover(result);
	}

	private attachCustomHover(result: IMarkdownRenderResult): IMarkdownRenderResult {
		const store = new DisposableStore();
		result.element.querySelectorAll('a').forEach((element) => {
			if (element.title) {
				const title = element.title;
				element.title = '';
				store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, title));
			}
		});

		return {
			element: result.element,
			dispose: () => {
				result.dispose();
				store.dispose();
			}
		};
	}

	protected override async openMarkdownLink(link: string, markdown: IMarkdownString) {
		try {
			const uri = URI.parse(link);
			if ((await this.fileService.stat(uri)).isDirectory) {
				return this.commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
			}
		} catch {
			// noop
		}

		return super.openMarkdownLink(link, markdown);
	}
}
