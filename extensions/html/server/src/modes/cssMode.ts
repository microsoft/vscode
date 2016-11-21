/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { LanguageService as HTMLLanguageService, HTMLDocument } from 'vscode-html-languageservice';
import { TextDocument, Position } from 'vscode-languageserver-types';
import { getCSSLanguageService, Stylesheet } from 'vscode-css-languageservice';
import { getEmbeddedDocument } from './embeddedSupport';
import { LanguageMode } from './languageModes';

export function getCSSMode(htmlLanguageService: HTMLLanguageService, htmlDocuments: LanguageModelCache<HTMLDocument>): LanguageMode {
	let cssLanguageService = getCSSLanguageService();
	let cssStylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => cssLanguageService.parseStylesheet(document));
	let getEmbeddedCSSDocument = (document: TextDocument) => getEmbeddedDocument(htmlLanguageService, document, htmlDocuments.get(document), 'css');

	return {
		getId() {
			return 'css';
		},
		configure(options: any) {
			cssLanguageService.configure(options && options.css);
		},
		doValidation(document: TextDocument) {
			let embedded = getEmbeddedCSSDocument(document);
			return cssLanguageService.doValidation(embedded, cssStylesheets.get(embedded));
		},
		doComplete(document: TextDocument, position: Position) {
			let embedded = getEmbeddedCSSDocument(document);
			return cssLanguageService.doComplete(embedded, position, cssStylesheets.get(embedded));
		},
		doHover(document: TextDocument, position: Position) {
			let embedded = getEmbeddedCSSDocument(document);
			return cssLanguageService.doHover(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentHighlight(document: TextDocument, position: Position) {
			let embedded = getEmbeddedCSSDocument(document);
			return cssLanguageService.findDocumentHighlights(embedded, position, cssStylesheets.get(embedded));
		},
		findDefinition(document: TextDocument, position: Position) {
			let embedded = getEmbeddedCSSDocument(document);
			return cssLanguageService.findDefinition(embedded, position, cssStylesheets.get(embedded));
		},
		findReferences(document: TextDocument, position: Position) {
			let embedded = getEmbeddedCSSDocument(document);
			return cssLanguageService.findReferences(embedded, position, cssStylesheets.get(embedded));
		},
		findColorSymbols(document: TextDocument) {
			let embedded = getEmbeddedCSSDocument(document);
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