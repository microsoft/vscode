/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getLanguageModelCache } from '../languageModelCache';
import { LanguageService as HTMLLanguageService, HTMLDocument, DocumentContext, FormattingOptions } from 'vscode-html-languageservice';
import { TextDocument, Position, Range } from 'vscode-languageserver-types';
import { LanguageMode } from './languageModes';

export function getHTMLMode(htmlLanguageService: HTMLLanguageService): LanguageMode {
	let settings: any = {};
	let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));
	return {
		getId() {
			return 'html';
		},
		configure(options: any) {
			settings = options && options.html;
		},
		doComplete(document: TextDocument, position: Position) {
			let options = settings && settings.suggest;
			return htmlLanguageService.doComplete(document, position, htmlDocuments.get(document), options);
		},
		doHover(document: TextDocument, position: Position) {
			return htmlLanguageService.doHover(document, position, htmlDocuments.get(document));
		},
		findDocumentHighlight(document: TextDocument, position: Position) {
			return htmlLanguageService.findDocumentHighlights(document, position, htmlDocuments.get(document));
		},
		findDocumentLinks(document: TextDocument, documentContext: DocumentContext) {
			return htmlLanguageService.findDocumentLinks(document, documentContext);
		},
		findDocumentSymbols(document: TextDocument) {
			return htmlLanguageService.findDocumentSymbols(document, htmlDocuments.get(document));
		},
		format(document: TextDocument, range: Range, formatParams: FormattingOptions) {
			let formatSettings = settings && settings.format;
			if (!formatSettings) {
				formatSettings = formatParams;
			} else {
				formatSettings = merge(formatParams, merge(formatSettings, {}));
			}
			return htmlLanguageService.format(document, range, formatSettings);
		},
		onDocumentRemoved(document: TextDocument) {
			htmlDocuments.onDocumentRemoved(document);
		},
		dispose() {
			htmlDocuments.dispose();
		}
	};
};

function merge(src: any, dst: any): any {
	for (var key in src) {
		if (src.hasOwnProperty(key)) {
			dst[key] = src[key];
		}
	}
	return dst;
}
