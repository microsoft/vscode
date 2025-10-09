/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { IRenderedMarkdown, MarkdownRenderOptions, renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { IMarkdownString, MarkdownStringTrustedOptions } from '../../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { EditorOption, IEditorOptions } from '../../../../common/config/editorOptions.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../common/config/fontInfo.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../common/languages/modesRegistry.js';
import { tokenizeToString } from '../../../../common/languages/textToHtmlTokenizer.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { ICodeEditor } from '../../../editorBrowser.js';
import './renderedMarkdown.css';

/**
 * Renders markdown to HTML.
 *
 * This interface allows a upper level component to pass a custom markdown renderer to sub-components.
 *
 * If you want to render markdown content in a standard way, prefer using the {@linkcode IMarkdownRendererService}.
 */
export interface IMarkdownRenderer {
	render(markdown: IMarkdownString, options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown;
}


export interface IMarkdownRendererExtraOptions {
	readonly editor?: ICodeEditor;
}


export const IMarkdownRendererService = createDecorator<IMarkdownRendererService>('markdownRendererService');

/**
 * Service that renders markdown content in a standard manner.
 *
 * Unlike the lower-level {@linkcode renderMarkdown} function, this includes built-in support for features such as syntax
 * highlighting of code blocks and link handling.
 *
 * This service should be preferred for rendering markdown in most cases.
 */
export interface IMarkdownRendererService extends IMarkdownRenderer {
	readonly _serviceBrand: undefined;

	render(markdown: IMarkdownString, options?: MarkdownRenderOptions & IMarkdownRendererExtraOptions, outElement?: HTMLElement): IRenderedMarkdown;
}


export class MarkdownRendererService implements IMarkdownRendererService {
	declare readonly _serviceBrand: undefined;

	private static _ttpTokenizer = createTrustedTypesPolicy('tokenizeToString', {
		createHTML(html: string) {
			return html;
		}
	});

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	render(markdown: IMarkdownString, options?: MarkdownRenderOptions & IMarkdownRendererExtraOptions, outElement?: HTMLElement): IRenderedMarkdown {
		const rendered = renderMarkdown(markdown, {
			codeBlockRenderer: (alias, value) => this.renderCodeBlock(alias, value, options ?? {}),
			actionHandler: (link, mdStr) => {
				return openLinkFromMarkdown(this._openerService, link, mdStr.isTrusted);
			},
			...options,
		}, outElement);
		rendered.element.classList.add('rendered-markdown');
		return rendered;
	}

	private async renderCodeBlock(languageAlias: string | undefined, value: string, options: IMarkdownRendererExtraOptions): Promise<HTMLElement> {
		// In markdown,
		// it is possible that we stumble upon language aliases (e.g.js instead of javascript)
		// it is possible no alias is given in which case we fall back to the current editor lang
		let languageId: string | undefined | null;
		if (languageAlias) {
			languageId = this._languageService.getLanguageIdByLanguageName(languageAlias);
		} else if (options.editor) {
			languageId = options.editor.getModel()?.getLanguageId();
		}
		if (!languageId) {
			languageId = PLAINTEXT_LANGUAGE_ID;
		}
		const html = await tokenizeToString(this._languageService, value, languageId);

		const content = MarkdownRendererService._ttpTokenizer ? MarkdownRendererService._ttpTokenizer.createHTML(html) ?? html : html;

		const root = document.createElement('span');
		root.innerHTML = content as string;
		const codeElement = root.querySelector('.monaco-tokenized-source');
		if (!isHTMLElement(codeElement)) {
			return document.createElement('span');
		}

		// use "good" font
		if (options.editor) {
			const fontInfo = options.editor.getOption(EditorOption.fontInfo);
			applyFontInfo(codeElement, fontInfo);
		} else {
			codeElement.style.fontFamily = this._configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		}

		return root;
	}
}

export async function openLinkFromMarkdown(openerService: IOpenerService, link: string, isTrusted: boolean | MarkdownStringTrustedOptions | undefined, skipValidation?: boolean): Promise<boolean> {
	try {
		return await openerService.open(link, {
			fromUserGesture: true,
			allowContributedOpeners: true,
			allowCommands: toAllowCommandsOption(isTrusted),
			skipValidation
		});
	} catch (e) {
		onUnexpectedError(e);
		return false;
	}
}

function toAllowCommandsOption(isTrusted: boolean | MarkdownStringTrustedOptions | undefined): boolean | readonly string[] {
	if (isTrusted === true) {
		return true; // Allow all commands
	}

	if (isTrusted && Array.isArray(isTrusted.enabledCommands)) {
		return isTrusted.enabledCommands; // Allow subset of commands
	}

	return false; // Block commands
}

registerSingleton(IMarkdownRendererService, MarkdownRendererService, InstantiationType.Delayed);
