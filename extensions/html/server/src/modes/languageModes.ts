/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { HTMLDocument, getLanguageService as getHTMLLanguageService, DocumentContext } from 'vscode-html-languageservice';
import { Location, SignatureHelp, Definition, TextEdit, TextDocument, Diagnostic, DocumentLink, Range, Hover, DocumentHighlight, CompletionList, Position, FormattingOptions } from 'vscode-languageserver-types';

import { getLanguageModelCache } from '../languageModelCache';
import { getLanguageAtPosition, getLanguagesInContent } from './embeddedSupport';
import { getCSSMode } from './cssMode';
import { getJavascriptMode } from './javascriptMode';
import { getHTMLMode } from './htmlMode';

export interface LanguageMode {
	configure?: (options: any) => void;
	doValidation?: (document: TextDocument) => Diagnostic[];
	doComplete?: (document: TextDocument, position: Position) => CompletionList;
	doHover?: (document: TextDocument, position: Position) => Hover;
	doSignatureHelp?: (document: TextDocument, position: Position) => SignatureHelp;
	findDocumentHighlight?: (document: TextDocument, position: Position) => DocumentHighlight[];
	findDocumentLinks?: (document: TextDocument, documentContext: DocumentContext) => DocumentLink[];
	findDefinition?: (document: TextDocument, position: Position) => Definition;
	findReferences?: (document: TextDocument, position: Position) => Location[];
	format?: (document: TextDocument, range: Range, options: FormattingOptions) => TextEdit[];
	findColorSymbols?: (document: TextDocument) => Range[];
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

export interface LanguageModes {
	getModeAtPosition(document: TextDocument, position: Position): LanguageMode;
	getAllModesInDocument(document: TextDocument): LanguageMode[];
	getAllModes(): LanguageMode[];
	getMode(languageId: string): LanguageMode;
}

export function getLanguageModes(supportedLanguages: { [languageId: string]: boolean; }): LanguageModes {

	var htmlLanguageService = getHTMLLanguageService();
	let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));

	let modes = {
		'html': getHTMLMode(htmlLanguageService, htmlDocuments),
		'css': supportedLanguages['css'] && getCSSMode(htmlLanguageService, htmlDocuments),
		'javascript': supportedLanguages['javascript'] && getJavascriptMode(htmlLanguageService, htmlDocuments)
	};
	return {
		getModeAtPosition(document: TextDocument, position: Position): LanguageMode {
			let languageId = getLanguageAtPosition(htmlLanguageService, document, htmlDocuments.get(document), position);
			if (languageId) {
				return modes[languageId];
			}
			return null;
		},
		getAllModesInDocument(document: TextDocument): LanguageMode[] {
			let result = [];
			let languageIds = getLanguagesInContent(htmlLanguageService, document, htmlDocuments.get(document));
			for (let languageId of languageIds) {
				let mode = modes[languageId];
				if (mode) {
					result.push(mode);
				}
			}
			return result;
		},
		getAllModes(): LanguageMode[] {
			let result = [];
			for (let languageId in modes) {
				let mode = modes[languageId];
				if (mode) {
					result.push(mode);
				}
			}
			return result;
		},
		getMode(languageId: string): LanguageMode {
			return modes[languageId];
		}
	};
}