/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import {parse} from './parser/htmlParser';
import {doComplete} from './services/htmlCompletion';
import {format} from './services/htmlFormatter';
import {findDocumentHighlights} from './services/htmlHighlighting';
import {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, TextEdit, DocumentHighlight, FormattingOptions, MarkedString } from 'vscode-languageserver-types';

export {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, TextEdit, DocumentHighlight, FormattingOptions, MarkedString };


export interface HTMLFormatConfiguration {
	tabSize: number;
	insertSpaces: boolean;
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
	findDocumentHighlights(document: TextDocument, position: Position, htmlDocument: HTMLDocument): DocumentHighlight[];
	doComplete(document: TextDocument, position: Position, htmlDocument: HTMLDocument): CompletionList;
//	doHover(document: TextDocument, position: Position, doc: HTMLDocument): Hover;
	format(document: TextDocument, range: Range, options: HTMLFormatConfiguration): TextEdit[];
}

export function getLanguageService() : LanguageService {
	return {
		doValidation: (document, htmlDocument) => { return []; },
		configure: (settings) => {},
		parseHTMLDocument: (document) => parse(document.getText()),
		doComplete,
		format,
		findDocumentHighlights
	};
}