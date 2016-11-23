/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { TextDocument, Position } from 'vscode-languageserver-types';
import { getCSSLanguageService, Stylesheet } from 'vscode-css-languageservice';
import { LanguageMode } from './languageModes';

export function getCSSMode(embeddedCSSDocuments: LanguageModelCache<TextDocument>): LanguageMode {
	let cssLanguageService = getCSSLanguageService();
	let cssStylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => cssLanguageService.parseStylesheet(document));

	return {
		getId() {
			return 'css';
		},
		configure(options: any) {
			cssLanguageService.configure(options && options.css);
		},
		doValidation(document: TextDocument) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doValidation(embedded, cssStylesheets.get(embedded));
		},
		doComplete(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doComplete(embedded, position, cssStylesheets.get(embedded));
		},
		doHover(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doHover(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentHighlight(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentHighlights(embedded, position, cssStylesheets.get(embedded));
		},
		findDefinition(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDefinition(embedded, position, cssStylesheets.get(embedded));
		},
		findReferences(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findReferences(embedded, position, cssStylesheets.get(embedded));
		},
		findColorSymbols(document: TextDocument) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findColorSymbols(embedded, cssStylesheets.get(embedded));
		},
		onDocumentRemoved(document: TextDocument) {
			cssStylesheets.onDocumentRemoved(document);
		},
		dispose() {
			cssStylesheets.dispose();
		}
	};
};