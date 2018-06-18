/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CompletionItemProvider, CompletionItem, CompletionItemKind, CancellationToken, TextDocument, Position, Range, TextEdit, workspace, CompletionContext } from 'vscode';
import phpGlobals = require('./phpGlobals');
import phpGlobalFunctions = require('./phpGlobalFunctions');

export default class PHPCompletionItemProvider implements CompletionItemProvider {

	public provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken, context: CompletionContext): Promise<CompletionItem[]> {
		let result: CompletionItem[] = [];

		let shouldProvideCompletionItems = workspace.getConfiguration('php').get<boolean>('suggest.basic', true);
		if (!shouldProvideCompletionItems) {
			return Promise.resolve(result);
		}

		var range = document.getWordRangeAtPosition(position);
		var prefix = range ? document.getText(range) : '';
		if (!range) {
			range = new Range(position, position);
		}

		if (context.triggerCharacter === '>') {
			const twoBeforeCursor = new Position(position.line, Math.max(0, position.character - 2));
			const previousTwoChars = document.getText(new Range(twoBeforeCursor, position));
			if (previousTwoChars !== '->') {
				return Promise.resolve(result);
			}
		}

		var added: any = {};
		var createNewProposal = function (kind: CompletionItemKind, name: string, entry: phpGlobals.IEntry | null): CompletionItem {
			var proposal: CompletionItem = new CompletionItem(name);
			proposal.kind = kind;
			if (entry) {
				if (entry.description) {
					proposal.documentation = entry.description;
				}
				if (entry.signature) {
					proposal.detail = entry.signature;
				}
			}
			return proposal;
		};

		var matches = (name: string) => {
			return prefix.length === 0 || name.length >= prefix.length && name.substr(0, prefix.length) === prefix;
		};

		if (matches('php') && range.start.character >= 2) {
			let twoBeforePosition = new Position(range.start.line, range.start.character - 2);
			let beforeWord = document.getText(new Range(twoBeforePosition, range.start));

			if (beforeWord === '<?') {
				let proposal = createNewProposal(CompletionItemKind.Class, '<?php', null);
				proposal.textEdit = new TextEdit(new Range(twoBeforePosition, position), '<?php');
				result.push(proposal);
				return Promise.resolve(result);
			}
		}

		for (var globalvariables in phpGlobals.globalvariables) {
			if (phpGlobals.globalvariables.hasOwnProperty(globalvariables) && matches(globalvariables)) {
				added[globalvariables] = true;
				result.push(createNewProposal(CompletionItemKind.Variable, globalvariables, phpGlobals.globalvariables[globalvariables]));
			}
		}
		for (var globalfunctions in phpGlobalFunctions.globalfunctions) {
			if (phpGlobalFunctions.globalfunctions.hasOwnProperty(globalfunctions) && matches(globalfunctions)) {
				added[globalfunctions] = true;
				result.push(createNewProposal(CompletionItemKind.Function, globalfunctions, phpGlobalFunctions.globalfunctions[globalfunctions]));
			}
		}
		for (var compiletimeconstants in phpGlobals.compiletimeconstants) {
			if (phpGlobals.compiletimeconstants.hasOwnProperty(compiletimeconstants) && matches(compiletimeconstants)) {
				added[compiletimeconstants] = true;
				result.push(createNewProposal(CompletionItemKind.Field, compiletimeconstants, phpGlobals.compiletimeconstants[compiletimeconstants]));
			}
		}
		for (var keywords in phpGlobals.keywords) {
			if (phpGlobals.keywords.hasOwnProperty(keywords) && matches(keywords)) {
				added[keywords] = true;
				result.push(createNewProposal(CompletionItemKind.Keyword, keywords, phpGlobals.keywords[keywords]));
			}
		}

		var text = document.getText();
		if (prefix[0] === '$') {
			var variableMatch = /\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g;
			var match: RegExpExecArray | null = null;
			while (match = variableMatch.exec(text)) {
				var word = match[0];
				if (!added[word]) {
					added[word] = true;
					result.push(createNewProposal(CompletionItemKind.Variable, word, null));
				}
			}
		}
		var functionMatch = /function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g;
		var match2: RegExpExecArray | null = null;
		while (match2 = functionMatch.exec(text)) {
			var word2 = match2[1];
			if (!added[word2]) {
				added[word2] = true;
				result.push(createNewProposal(CompletionItemKind.Function, word2, null));
			}
		}
		return Promise.resolve(result);
	}
}
