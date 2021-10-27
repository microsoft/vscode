/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown, MarkdownRenderOptions, MarkedOptions } from 'vs/base/browser/markdownRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ILanguageIdCodec, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/modes';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { URI } from 'vs/base/common/uri';
import { Configuration } from 'vs/editor/browser/config/configuration';

export interface IMarkdownRenderResult extends IDisposable {
	element: HTMLElement;
}

export interface IMarkdownRendererOptions {
	editor?: ICodeEditor;
	baseUrl?: URI;
	codeBlockFontFamily?: string;
}

/**
 * Markdown renderer that can render codeblocks with the editor mechanics. This
 * renderer should always be preferred.
 */
export class MarkdownRenderer {

	private static _ttpTokenizer = window.trustedTypes?.createPolicy('tokenizeToString', {
		createHTML(value: string, languageIdCodec: ILanguageIdCodec, tokenizer: ITokenizationSupport | undefined) {
			return tokenizeToString(value, languageIdCodec, tokenizer);
		}
	});

	private readonly _onDidRenderAsync = new Emitter<void>();
	readonly onDidRenderAsync = this._onDidRenderAsync.event;

	constructor(
		private readonly _options: IMarkdownRendererOptions,
		@IModeService private readonly _modeService: IModeService,
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
		return {
			element: rendered.element,
			dispose: () => disposables.dispose()
		};
	}

	protected _getRenderOptions(markdown: IMarkdownString, disposeables: DisposableStore): MarkdownRenderOptions {
		return {
			baseUrl: this._options.baseUrl,
			codeBlockRenderer: async (languageAlias, value) => {
				// In markdown,
				// it is possible that we stumble upon language aliases (e.g.js instead of javascript)
				// it is possible no alias is given in which case we fall back to the current editor lang
				let languageId: string | undefined | null;
				if (languageAlias) {
					languageId = this._modeService.getModeIdForLanguageName(languageAlias);
				} else if (this._options.editor) {
					languageId = this._options.editor.getModel()?.getLanguageId();
				}
				if (!languageId) {
					languageId = 'plaintext';
				}
				this._modeService.triggerMode(languageId);
				const tokenization = await TokenizationRegistry.getPromise(languageId) ?? undefined;

				const element = document.createElement('span');

				element.innerHTML = (MarkdownRenderer._ttpTokenizer?.createHTML(value, this._modeService.languageIdCodec, tokenization) ?? tokenizeToString(value, this._modeService.languageIdCodec, tokenization)) as string;

				// use "good" font
				if (this._options.editor) {
					const fontInfo = this._options.editor.getOption(EditorOption.fontInfo);
					Configuration.applyFontInfoSlow(element, fontInfo);
				} else if (this._options.codeBlockFontFamily) {
					element.style.fontFamily = this._options.codeBlockFontFamily;
				}

				return element;
			},
			asyncRenderCallback: () => this._onDidRenderAsync.fire(),
			actionHandler: {
				callback: (content) => this._openerService.open(content, { fromUserGesture: true, allowContributedOpeners: true, allowCommands: markdown.isTrusted }).catch(onUnexpectedError),
				disposables: disposeables
			}
		};
	}
}
