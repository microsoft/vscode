/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownRenderOptions, MarkedOptions, renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { IMarkdownString, MarkdownStringTrustedOptions } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./renderedMarkdown';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { tokenizeToString } from 'vs/editor/common/languages/textToHtmlTokenizer';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export interface IMarkdownRenderResult extends IDisposable {
	readonly element: HTMLElement;
}

export interface IMarkdownRendererOptions {
	readonly editor?: ICodeEditor;
	readonly codeBlockFontFamily?: string;
	readonly codeBlockFontSize?: string;
}

/**
 * Markdown renderer that can render codeblocks with the editor mechanics. This
 * renderer should always be preferred.
 */
export class MarkdownRenderer {

	private static _ttpTokenizer = createTrustedTypesPolicy('tokenizeToString', {
		createHTML(html: string) {
			return html;
		}
	});

	private readonly _onDidRenderAsync = new Emitter<void>();
	readonly onDidRenderAsync = this._onDidRenderAsync.event;

	constructor(
		private readonly _options: IMarkdownRendererOptions,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	dispose(): void {
		this._onDidRenderAsync.dispose();
	}

	render(markdown: IMarkdownString | undefined, options?: MarkdownRenderOptions, markedOptions?: MarkedOptions): IMarkdownRenderResult {
		if (!markdown) {
			const element = document.createElement('span');
			return { element, dispose: () => { } };
		}

		const disposables = new DisposableStore();
		const rendered = disposables.add(renderMarkdown(markdown, { ...this._getRenderOptions(markdown, disposables), ...options }, markedOptions));
		rendered.element.classList.add('rendered-markdown');
		return {
			element: rendered.element,
			dispose: () => disposables.dispose()
		};
	}

	protected _getRenderOptions(markdown: IMarkdownString, disposables: DisposableStore): MarkdownRenderOptions {
		return {
			codeBlockRenderer: async (languageAlias, value) => {
				// In markdown,
				// it is possible that we stumble upon language aliases (e.g.js instead of javascript)
				// it is possible no alias is given in which case we fall back to the current editor lang
				let languageId: string | undefined | null;
				if (languageAlias) {
					languageId = this._languageService.getLanguageIdByLanguageName(languageAlias);
				} else if (this._options.editor) {
					languageId = this._options.editor.getModel()?.getLanguageId();
				}
				if (!languageId) {
					languageId = PLAINTEXT_LANGUAGE_ID;
				}
				const html = await tokenizeToString(this._languageService, value, languageId);

				const element = document.createElement('span');

				element.innerHTML = (MarkdownRenderer._ttpTokenizer?.createHTML(html) ?? html) as string;

				// use "good" font
				if (this._options.editor) {
					const fontInfo = this._options.editor.getOption(EditorOption.fontInfo);
					applyFontInfo(element, fontInfo);
				} else if (this._options.codeBlockFontFamily) {
					element.style.fontFamily = this._options.codeBlockFontFamily;
				}

				if (this._options.codeBlockFontSize !== undefined) {
					element.style.fontSize = this._options.codeBlockFontSize;
				}

				return element;
			},
			asyncRenderCallback: () => this._onDidRenderAsync.fire(),
			actionHandler: {
				callback: (link) => openLinkFromMarkdown(this._openerService, link, markdown.isTrusted),
				disposables: disposables
			}
		};
	}
}

export async function openLinkFromMarkdown(openerService: IOpenerService, link: string, isTrusted: boolean | MarkdownStringTrustedOptions | undefined): Promise<boolean> {
	try {
		return await openerService.open(link, {
			fromUserGesture: true,
			allowContributedOpeners: true,
			allowCommands: toAllowCommandsOption(isTrusted),
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
