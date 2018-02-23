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

import { ColorInformation, ColorPresentation, Color } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';

import { getLanguageModelCache, LanguageModelCache } from '../languageModelCache';
import { getDocumentRegions, HTMLDocumentRegions } from './embeddedSupport';
import { getCSSMode } from './cssMode';
import { getJavascriptMode } from './javascriptMode';
import { getHTMLMode } from './htmlMode';

export { ColorInformation, ColorPresentation, Color };

export interface Settings {
	css?: any;
	html?: any;
	javascript?: any;
	emmet?: { [key: string]: any };
}

export interface SettingProvider {
	getDocumentSettings(textDocument: TextDocument): Thenable<Settings>;
}

export interface LanguageMode {
	getId(): string;
	configure?: (options: Settings) => void;
	doValidation?: (document: TextDocument, settings?: Settings) => Diagnostic[];
	doComplete?: (document: TextDocument, position: Position, settings?: Settings) => CompletionList | null;
	setCompletionParticipants?: (registeredCompletionParticipants: any[]) => void;
	doResolve?: (document: TextDocument, item: CompletionItem) => CompletionItem | null;
	doHover?: (document: TextDocument, position: Position) => Hover | null;
	doSignatureHelp?: (document: TextDocument, position: Position) => SignatureHelp | null;
	findDocumentHighlight?: (document: TextDocument, position: Position) => DocumentHighlight[];
	findDocumentSymbols?: (document: TextDocument) => SymbolInformation[];
	findDocumentLinks?: (document: TextDocument, documentContext: DocumentContext) => DocumentLink[];
	findDefinition?: (document: TextDocument, position: Position) => Definition | null;
	findReferences?: (document: TextDocument, position: Position) => Location[];
	format?: (document: TextDocument, range: Range, options: FormattingOptions, settings?: Settings) => TextEdit[];
	findDocumentColors?: (document: TextDocument) => ColorInformation[];
	getColorPresentations?: (document: TextDocument, color: Color, range: Range) => ColorPresentation[];
	doAutoClose?: (document: TextDocument, position: Position) => string | null;
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

export interface LanguageModes {
	getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined;
	getModesInRange(document: TextDocument, range: Range): LanguageModeRange[];
	getAllModes(): LanguageMode[];
	getAllModesInDocument(document: TextDocument): LanguageMode[];
	getMode(languageId: string): LanguageMode | undefined;
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

export interface LanguageModeRange extends Range {
	mode: LanguageMode | undefined;
	attributeValue?: boolean;
}

export function getLanguageModes(supportedLanguages: { [languageId: string]: boolean; }): LanguageModes {

	var htmlLanguageService = getHTMLLanguageService();
	let documentRegions = getLanguageModelCache<HTMLDocumentRegions>(10, 60, document => getDocumentRegions(htmlLanguageService, document));

	let modelCaches: LanguageModelCache<any>[] = [];
	modelCaches.push(documentRegions);

	let modes = Object.create(null);
	modes['html'] = getHTMLMode(htmlLanguageService);
	if (supportedLanguages['css']) {
		modes['css'] = getCSSMode(documentRegions);
	}
	if (supportedLanguages['javascript']) {
		modes['javascript'] = getJavascriptMode(documentRegions);
	}
	return {
		getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined {
			let languageId = documentRegions.get(document).getLanguageAtPosition(position);
			if (languageId) {
				return modes[languageId];
			}
			return void 0;
		},
		getModesInRange(document: TextDocument, range: Range): LanguageModeRange[] {
			return documentRegions.get(document).getLanguageRanges(range).map(r => {
				return <LanguageModeRange>{
					start: r.start,
					end: r.end,
					mode: r.languageId && modes[r.languageId],
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