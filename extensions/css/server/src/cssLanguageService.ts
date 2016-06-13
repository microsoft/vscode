/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument, Position, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	Location, DocumentHighlight, CodeActionContext, Command} from 'vscode-languageserver';

import {Stylesheet} from './parser/cssNodes';
import {Parser} from './parser/cssParser';
import {CSSCompletion} from './services/cssCompletion';
import {CSSHover} from './services/cssHover';
import {CSSNavigation} from './services/cssNavigation';
import {CSSCodeActions} from './services/cssCodeActions';
import {CSSValidation} from './services/cssValidation';

export interface LanguageService {
	configure(raw: LanguageSettings): void;
	doValidation(document: TextDocument, stylesheet: Stylesheet): Thenable<Diagnostic[]>;
	parseStylesheet(document: TextDocument): Stylesheet;
	doComplete(document: TextDocument, position: Position, stylesheet: Stylesheet): Thenable<CompletionList>;
	doHover(document: TextDocument, position: Position, stylesheet: Stylesheet): Thenable<Hover>;
	findDefinition(document: TextDocument, position: Position, stylesheet: Stylesheet): Thenable<Location>;
	findReferences(document: TextDocument, position: Position, stylesheet: Stylesheet): Thenable<Location[]>;
	findDocumentHighlights(document: TextDocument, position: Position, stylesheet: Stylesheet): Thenable<DocumentHighlight[]>;
	findDocumentSymbols(document: TextDocument, stylesheet: Stylesheet): Thenable<SymbolInformation[]>;
	doCodeActions(document: TextDocument, range: Range, context: CodeActionContext, stylesheet: Stylesheet): Thenable<Command[]>;
	findColorSymbols(document: TextDocument, stylesheet: Stylesheet): Thenable<Range[]>;
}

export interface LanguageSettings {
	validate?: boolean;
	lint?: any;
}

export function getCSSLanguageService() : LanguageService {
	let parser = new Parser();
	let cssCompletion = new CSSCompletion();
	let cssHover = new CSSHover();
	let cssValidation = new CSSValidation();
	let cssNavigation = new CSSNavigation();
	let cssCodeActions = new CSSCodeActions();
	return {
		configure: cssValidation.configure.bind(cssValidation),
		doValidation: cssValidation.doValidation.bind(cssValidation),
		parseStylesheet: parser.parseStylesheet.bind(parser),
		doComplete: cssCompletion.doComplete.bind(cssCompletion),
		doHover: cssHover.doHover.bind(cssHover),
		findDefinition: cssNavigation.findDefinition.bind(cssNavigation),
		findReferences: cssNavigation.findReferences.bind(cssNavigation),
		findDocumentHighlights: cssNavigation.findDocumentHighlights.bind(cssNavigation),
		findDocumentSymbols: cssNavigation.findDocumentSymbols.bind(cssNavigation),
		doCodeActions: cssCodeActions.doCodeActions.bind(cssCodeActions),
		findColorSymbols: cssNavigation.findColorSymbols.bind(cssNavigation)
	};
}