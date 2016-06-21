/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument, Position, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	Location, DocumentHighlight, CodeActionContext, Command, WorkspaceEdit} from 'vscode-languageserver';

import {Stylesheet} from './parser/cssNodes';
import {Parser} from './parser/cssParser';
import {CSSCompletion} from './services/cssCompletion';
import {CSSHover} from './services/cssHover';
import {CSSNavigation} from './services/cssNavigation';
import {CSSCodeActions} from './services/cssCodeActions';
import {CSSValidation} from './services/cssValidation';

import {SCSSParser} from './parser/scssParser';
import {SCSSCompletion} from './services/scssCompletion';
import {LESSParser} from './parser/lessParser';
import {LESSCompletion} from './services/lessCompletion';

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
	doRename(document: TextDocument, position: Position, newName: string, stylesheet: Stylesheet): Thenable<WorkspaceEdit>;
}

export interface LanguageSettings {
	validate?: boolean;
	lint?: any;
}

let cssParser = new Parser();
let cssCompletion = new CSSCompletion();
let cssHover = new CSSHover();
let cssNavigation = new CSSNavigation();
let cssCodeActions = new CSSCodeActions();

export function getCSSLanguageService() : LanguageService {
	let cssValidation = new CSSValidation(); // an instance per language service
	return {
		configure: cssValidation.configure.bind(cssValidation),
		doValidation: cssValidation.doValidation.bind(cssValidation),
		parseStylesheet: cssParser.parseStylesheet.bind(cssParser),
		doComplete: cssCompletion.doComplete.bind(cssCompletion),
		doHover: cssHover.doHover.bind(cssHover),
		findDefinition: cssNavigation.findDefinition.bind(cssNavigation),
		findReferences: cssNavigation.findReferences.bind(cssNavigation),
		findDocumentHighlights: cssNavigation.findDocumentHighlights.bind(cssNavigation),
		findDocumentSymbols: cssNavigation.findDocumentSymbols.bind(cssNavigation),
		doCodeActions: cssCodeActions.doCodeActions.bind(cssCodeActions),
		findColorSymbols: cssNavigation.findColorSymbols.bind(cssNavigation),
		doRename: cssNavigation.doRename.bind(cssNavigation),
	};
}

let scssParser = new SCSSParser();
let scssCompletion = new SCSSCompletion();

export function getSCSSLanguageService() : LanguageService {
	let languageService = getCSSLanguageService();
	languageService.parseStylesheet = scssParser.parseStylesheet.bind(scssParser);
	languageService.doComplete = scssCompletion.doComplete.bind(scssCompletion);
	return languageService;
}

let lessParser = new LESSParser();
let lessCompletion = new LESSCompletion();

export function getLESSLanguageService() : LanguageService {
	let languageService = getCSSLanguageService();
	languageService.parseStylesheet = lessParser.parseStylesheet.bind(lessParser);
	languageService.doComplete = lessCompletion.doComplete.bind(lessCompletion);
	return languageService;
}