/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getLanguageModelCache } from '../languageModelCache';
import { LanguageService as HTMLLanguageService, HTMLDocument, DocumentContext, FormattingOptions, HTMLFormatConfiguration, TokenType } from 'vscode-html-languageservice';
import { TextDocument, Position, Range } from 'vscode-languageserver-types';
import { LanguageMode, Settings } from './languageModes';

export function getHTMLMode(htmlLanguageService: HTMLLanguageService): LanguageMode {
	let globalSettings: Settings = {};
	let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));
	let completionParticipants = [];
	return {
		getId() {
			return 'html';
		},
		configure(options: any) {
			globalSettings = options;
		},
		doComplete(document: TextDocument, position: Position, settings: Settings = globalSettings) {
			let options = settings && settings.html && settings.html.suggest;
			let doAutoComplete = settings && settings.html && settings.html.autoClosingTags;
			if (doAutoComplete) {
				options.hideAutoCompleteProposals = true;
			}

			const htmlDocument = htmlDocuments.get(document);
			const offset = document.offsetAt(position);
			const node = htmlDocument.findNodeBefore(offset);
			const scanner = htmlLanguageService.createScanner(document.getText(), node.start);
			let token = scanner.scan();
			while (token !== TokenType.EOS && scanner.getTokenOffset() <= offset) {
				if (token === TokenType.Content && offset <= scanner.getTokenEnd()) {
					completionParticipants.forEach(participant => { if (participant.onHtmlContent) { participant.onHtmlContent(); } });
					break;
				}
				token = scanner.scan();
			}
			return htmlLanguageService.doComplete(document, position, htmlDocument, options);
		},
		setCompletionParticipants(registeredCompletionParticipants: any[]) {
			completionParticipants = registeredCompletionParticipants;
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
		format(document: TextDocument, range: Range, formatParams: FormattingOptions, settings: Settings = globalSettings) {
			let formatSettings: HTMLFormatConfiguration = settings && settings.html && settings.html.format;
			if (formatSettings) {
				formatSettings = merge(formatSettings, {});
			} else {
				formatSettings = {};
			}
			if (formatSettings.contentUnformatted) {
				formatSettings.contentUnformatted = formatSettings.contentUnformatted + ',script';
			} else {
				formatSettings.contentUnformatted = 'script';
			}
			formatSettings = merge(formatParams, formatSettings);
			return htmlLanguageService.format(document, range, formatSettings);
		},
		doAutoClose(document: TextDocument, position: Position) {
			let offset = document.offsetAt(position);
			let text = document.getText();
			if (offset > 0 && text.charAt(offset - 1).match(/[>\/]/g)) {
				return htmlLanguageService.doTagComplete(document, position, htmlDocuments.get(document));
			}
			return null;
		},
		onDocumentRemoved(document: TextDocument) {
			htmlDocuments.onDocumentRemoved(document);
		},
		dispose() {
			htmlDocuments.dispose();
		}
	};
}

function merge(src: any, dst: any): any {
	for (var key in src) {
		if (src.hasOwnProperty(key)) {
			dst[key] = src[key];
		}
	}
	return dst;
}
