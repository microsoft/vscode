/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { TextDocument, Position, Range, CompletionList } from 'vscode-languageserver-types';
import { Stylesheet, FoldingRange, LanguageService as CSSLanguageService } from 'vscode-css-languageservice';
import { LanguageMode, Workspace } from './languageModes';
import { HTMLDocumentRegions, CSS_STYLE_RULE } from './embeddedSupport';
import { Color } from 'vscode-languageserver';

export function getCSSMode(cssLanguageService: CSSLanguageService, documentRegions: LanguageModelCache<HTMLDocumentRegions>, workspace: Workspace): LanguageMode {
	let embeddedCSSDocuments = getLanguageModelCache<TextDocument>(10, 60, document => documentRegions.get(document).getEmbeddedDocument('css'));
	let cssStylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => cssLanguageService.parseStylesheet(document));

	return {
		getId() {
			return 'css';
		},
		doValidation(document: TextDocument, settings = workspace.settings) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doValidation(embedded, cssStylesheets.get(embedded), settings && settings.css);
		},
		doComplete(document: TextDocument, position: Position, _settings = workspace.settings) {
			let embedded = embeddedCSSDocuments.get(document);
			const stylesheet = cssStylesheets.get(embedded);
			return cssLanguageService.doComplete(embedded, position, stylesheet) || CompletionList.create();
		},
		doHover(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doHover(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentHighlight(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentHighlights(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentSymbols(document: TextDocument) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentSymbols(embedded, cssStylesheets.get(embedded)).filter(s => s.name !== CSS_STYLE_RULE);
		},
		findDefinition(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDefinition(embedded, position, cssStylesheets.get(embedded));
		},
		findReferences(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findReferences(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentColors(document: TextDocument) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentColors(embedded, cssStylesheets.get(embedded));
		},
		getColorPresentations(document: TextDocument, color: Color, range: Range) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.getColorPresentations(embedded, cssStylesheets.get(embedded), color, range);
		},
		getFoldingRanges(document: TextDocument): FoldingRange[] {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.getFoldingRanges(embedded, {});
		},
		onDocumentRemoved(document: TextDocument) {
			embeddedCSSDocuments.onDocumentRemoved(document);
			cssStylesheets.onDocumentRemoved(document);
		},
		dispose() {
			embeddedCSSDocuments.dispose();
			cssStylesheets.dispose();
		}
	};
}