/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMarkdownCodeBlockRenderer, IMarkdownRendererExtraOptions } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { EditorOption, IEditorOptions } from '../../../../common/config/editorOptions.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../common/config/fontInfo.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../common/languages/modesRegistry.js';
import { tokenizeToString } from '../../../../common/languages/textToHtmlTokenizer.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { isCodeEditor } from '../../../editorBrowser.js';
import './renderedMarkdown.css';

/**
 * Renders markdown code blocks using the editor's tokenization and font settings.
 */
export class EditorMarkdownCodeBlockRenderer implements IMarkdownCodeBlockRenderer {

	private static _ttpTokenizer = createTrustedTypesPolicy('tokenizeToString', {
		createHTML(html: string) {
			return html;
		}
	});

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) { }

	public async renderCodeBlock(languageAlias: string | undefined, value: string, options: IMarkdownRendererExtraOptions): Promise<HTMLElement> {
		const editor = isCodeEditor(options.context) ? options.context : undefined;

		// In markdown, it is possible that we stumble upon language aliases (e.g.js instead of javascript).
		// it is possible no alias is given in which case we fall back to the current editor lang
		let languageId: string | undefined | null;
		if (languageAlias) {
			languageId = this._languageService.getLanguageIdByLanguageName(languageAlias);
		} else if (editor) {
			languageId = editor.getModel()?.getLanguageId();
		}
		if (!languageId) {
			languageId = PLAINTEXT_LANGUAGE_ID;
		}
		const html = await tokenizeToString(this._languageService, value, languageId);

		const content = EditorMarkdownCodeBlockRenderer._ttpTokenizer ? EditorMarkdownCodeBlockRenderer._ttpTokenizer.createHTML(html) ?? html : html;

		const root = document.createElement('span');
		root.innerHTML = content as string;
		// eslint-disable-next-line no-restricted-syntax
		const codeElement = root.querySelector('.monaco-tokenized-source');
		if (!isHTMLElement(codeElement)) {
			return document.createElement('span');
		}

		// use "good" font
		if (editor) {
			const fontInfo = editor.getOption(EditorOption.fontInfo);
			applyFontInfo(codeElement, fontInfo);
		} else {
			codeElement.style.fontFamily = this._configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		}

		return root;
	}
}
