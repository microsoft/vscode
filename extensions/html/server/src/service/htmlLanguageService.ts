/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import {parse} from './parser/htmlParser';
import {doComplete} from './services/htmlCompletion';
import {format} from './services/htmlFormatter';
import {provideLinks} from './services/htmlLinks';
import {findDocumentHighlights} from './services/htmlHighlighting';
import {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, TextEdit, DocumentHighlight, FormattingOptions, MarkedString } from 'vscode-languageserver-types';

export {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, TextEdit, DocumentHighlight, FormattingOptions, MarkedString };


export class DocumentLink {

	/**
	 * The range this link applies to.
	 */
	range: Range;

	/**
	 * The uri this link points to.
	 */
	target: string;

}


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

export interface CompletionConfiguration {
	[provider:string]:boolean;
}

export declare type HTMLDocument = {};

export interface LanguageService {
	parseHTMLDocument(document: TextDocument): HTMLDocument;
	findDocumentHighlights(document: TextDocument, position: Position, htmlDocument: HTMLDocument): DocumentHighlight[];
	doComplete(document: TextDocument, position: Position, htmlDocument: HTMLDocument, options?: CompletionConfiguration): CompletionList;
	format(document: TextDocument, range: Range, options: HTMLFormatConfiguration): TextEdit[];
	provideLinks(document: TextDocument, workspacePath:string): DocumentLink[];
}

export function getLanguageService() : LanguageService {
	return {
		parseHTMLDocument: (document) => parse(document.getText()),
		doComplete,
		format,
		findDocumentHighlights,
		provideLinks
	};
}