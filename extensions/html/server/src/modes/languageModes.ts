/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getLanguageService as getHTMLLanguageService, DocumentContext } from 'vscode-html-languageservice';
import {
	CompletionItem, Location, SignatureHelp, Definition, TextEdit, TextDocument, Diagnostic, DocumentLink, Range,
	Hover, DocumentHighlight, CompletionList, Position, FormattingOptions, SymbolInformation
} from 'vscode-languageserver-types';

import { getLanguageModelCache, LanguageModelCache } from '../languageModelCache';
import { getDocumentRegions, HTMLDocumentRegions } from './embeddedSupport';
import { getCSSMode } from './cssMode';
import { getJavascriptMode } from './javascriptMode';
import { getHTMLMode } from './htmlMode';

export interface LanguageMode {
	getId();
	configure?: (options: any) => void;
	doValidation?: (document: TextDocument) => Diagnostic[];
	doComplete?: (document: TextDocument, position: Position) => CompletionList;
	doResolve?: (document: TextDocument, item: CompletionItem) => CompletionItem;
	doHover?: (document: TextDocument, position: Position) => Hover;
	doSignatureHelp?: (document: TextDocument, position: Position) => SignatureHelp;
	findDocumentHighlight?: (document: TextDocument, position: Position) => DocumentHighlight[];
	findDocumentSymbols?: (document: TextDocument) => SymbolInformation[];
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
	getModesInRange(document: TextDocument, range: Range): LanguageModeRange[];
	getAllModes(): LanguageMode[];
	getAllModesInDocument(document: TextDocument): LanguageMode[];
	getMode(languageId: string): LanguageMode;
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

export interface LanguageModeRange extends Range {
	mode: LanguageMode;
	attributeValue?: boolean;
}

export function getLanguageModes(supportedLanguages: { [languageId: string]: boolean; }): LanguageModes {

	var htmlLanguageService = getHTMLLanguageService();
	let documentRegions = getLanguageModelCache<HTMLDocumentRegions>(10, 60, document => getDocumentRegions(htmlLanguageService, document));

	let modelCaches: LanguageModelCache<any>[] = [];
	modelCaches.push(documentRegions);

	let modes = {};
	modes['html'] = getHTMLMode(htmlLanguageService);
	if (supportedLanguages['css']) {
		modes['css'] = getCSSMode(documentRegions);
	}
	if (supportedLanguages['javascript']) {
		modes['javascript'] = getJavascriptMode(documentRegions);
	}
	return {
		getModeAtPosition(document: TextDocument, position: Position): LanguageMode {
			let languageId = documentRegions.get(document).getLanguageAtPosition(position);;
			if (languageId) {
				return modes[languageId];
			}
			return null;
		},
		getModesInRange(document: TextDocument, range: Range): LanguageModeRange[] {
			return documentRegions.get(document).getLanguageRanges(range).map(r => {
				return {
					start: r.start,
					end: r.end,
					mode: modes[r.languageId],
					attributeValue: r.attributeValue
				};
			});
		},
		getAllModesInDocument(document: TextDocument): LanguageMode[] {
			let result = [];
			for (let languageId of documentRegions.get(document).getLanguagesInDocument()) {
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
		},
		onDocumentRemoved(document: TextDocument) {
			modelCaches.forEach(mc => mc.onDocumentRemoved(document));
			for (let mode in modes) {
				modes[mode].onDocumentRemoved(document);
			}
		},
		dispose(): void {
			modelCaches.forEach(mc => mc.dispose());
			modelCaches = [];
			for (let mode in modes) {
				modes[mode].dispose();
			}
			modes = {};
		}
	};
}