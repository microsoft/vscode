/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import { parse} from './parser/htmlParser';
import { doComplete } from './services/htmlCompletion';
import { TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, TextEdit, FormattingOptions, MarkedString } from 'vscode-languageserver-types';

export { TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, TextEdit, FormattingOptions, MarkedString };


export interface HTMLFormatConfiguration {
	wrapLineLength: number;
	unformatted: string;
	indentInnerHtml: boolean;
	preserveNewLines: boolean;
	maxPreserveNewLines: number;
	indentHandlebars: boolean;
	endWithNewline: boolean;
	extraLiners: string;
}

export interface LanguageSettings {
	validate: boolean;
	format: HTMLFormatConfiguration;
}

export declare type HTMLDocument = {};

export interface LanguageService {
	configure(settings: LanguageSettings): void;
	parseHTMLDocument(document: TextDocument): HTMLDocument;
	doValidation(document: TextDocument, htmlDocument: HTMLDocument): Diagnostic[];

//	doResolve(item: CompletionItem): CompletionItem;
	doComplete(document: TextDocument, position: Position, doc: HTMLDocument): CompletionList;
//	findDocumentSymbols(document: TextDocument, doc: HTMLDocument): SymbolInformation[];
//	doHover(document: TextDocument, position: Position, doc: HTMLDocument): Hover;
//	format(document: TextDocument, range: Range, options: FormattingOptions): TextEdit[];
}

export function getLanguageService() : LanguageService {
	return {
		doValidation: (document, htmlDocument) => { return []; },

		configure: (settings) => {},
		parseHTMLDocument: (document) => parse(document.getText()),
		doComplete
	};
}