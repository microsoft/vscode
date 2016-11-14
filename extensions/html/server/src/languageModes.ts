/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, Position, HTMLDocument, Diagnostic, CompletionList, Hover, getLanguageService as getHTMLLanguageService,
	DocumentHighlight, DocumentLink, DocumentContext, Range, TextEdit, FormattingOptions, CompletionConfiguration, HTMLFormatConfiguration
} from 'vscode-html-languageservice';
import { getCSSLanguageService, Stylesheet } from 'vscode-css-languageservice';

import { getLanguageModelCache } from './languageModelCache';
import { getEmbeddedDocument, getEmbeddedLanguageAtPosition, hasEmbeddedContent } from './embeddedSupport';

export interface LanguageMode {
	doValidation?: (document: TextDocument) => Diagnostic[];
	doComplete?: (document: TextDocument, position: Position) => CompletionList;
	doHover?: (document: TextDocument, position: Position) => Hover;
	findDocumentHighlight?: (document: TextDocument, position: Position) => DocumentHighlight[];
	findDocumentLinks?: (document: TextDocument, documentContext: DocumentContext) => DocumentLink[];
	format?: (document: TextDocument, range: Range, options: FormattingOptions) => TextEdit[];
	findColorSymbols?: (document: TextDocument) => Range[];
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

// The settings interface describes the server relevant settings part
export interface Settings {
	html: HTMLLanguageSettings;
	css: any;
}

export interface HTMLLanguageSettings {
	suggest: CompletionConfiguration;
	format: HTMLFormatConfiguration;
}

export interface LanguageModes {
	getModeAtPosition(document: TextDocument, position: Position): LanguageMode;
	getAllModesInDocument(document: TextDocument): LanguageMode[];
	getAllModes(): LanguageMode[];
	getMode(languageId: string): LanguageMode;
	configure(options: Settings): void;
}

export function getLanguageModes(supportedLanguages: { [languageId: string]: boolean; }): LanguageModes {

	var htmlLanguageService = getHTMLLanguageService();
	let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));

	let modes: { [id: string]: LanguageMode } = {};
	let settings: any = {};

	supportedLanguages['html'] = true;
	modes['html'] = {
		doComplete(document: TextDocument, position: Position) {
			let options = settings && settings.html && settings.html.suggest;
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
		format(document: TextDocument, range: Range, formatParams: FormattingOptions) {
			let formatSettings = settings && settings.html && settings.html.format;
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
	if (supportedLanguages['css']) {
		let cssLanguageService = getCSSLanguageService();
		let cssStylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => cssLanguageService.parseStylesheet(document));
		let getEmbeddedCSSDocument = (document: TextDocument) => getEmbeddedDocument(htmlLanguageService, document, htmlDocuments.get(document), 'css');

		modes['css'] = {
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

	return {
		getModeAtPosition(document: TextDocument, position: Position): LanguageMode {
			let languageId = getEmbeddedLanguageAtPosition(htmlLanguageService, document, htmlDocuments.get(document), position);
			if (supportedLanguages[languageId]) {
				return modes[languageId];
			}
			return null;
		},
		getAllModesInDocument(document: TextDocument): LanguageMode[] {
			let result = [modes['html']];
			let embeddedLanguageIds = hasEmbeddedContent(htmlLanguageService, document, htmlDocuments.get(document));
			for (let languageId of embeddedLanguageIds) {
				if (supportedLanguages[languageId]) {
					result.push(modes[languageId]);
				}
			}
			return result;
		},
		getAllModes(): LanguageMode[] {
			let result = [];
			for (let languageId in modes) {
				if (supportedLanguages[languageId]) {
					result.push(modes[languageId]);
				}
			}
			return result;
		},
		getMode(languageId: string): LanguageMode {
			return modes[languageId];
		},
		configure(options: any): void {
			settings = options;
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
