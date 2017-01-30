/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CompletionItemProvider, CompletionItem, CompletionItemKind, CancellationToken, TextDocument, Position, Range, TextEdit, workspace } from 'vscode';
import phpGlobals = require('./phpGlobals');

export default class PHPCompletionItemProvider implements CompletionItemProvider {

	public triggerCharacters = ['.', ':', '$'];

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
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

		var added: any = {};
		var createNewProposal = function (kind: CompletionItemKind, name: string, entry: phpGlobals.IEntry): CompletionItem {
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

		for (var name in phpGlobals.globalvariables) {
			if (phpGlobals.globalvariables.hasOwnProperty(name) && matches(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Variable, name, phpGlobals.globalvariables[name]));
			}
		}
		for (var name in phpGlobals.globalfunctions) {
			if (phpGlobals.globalfunctions.hasOwnProperty(name) && matches(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Function, name, phpGlobals.globalfunctions[name]));
			}
		}
		for (var name in phpGlobals.compiletimeconstants) {
			if (phpGlobals.compiletimeconstants.hasOwnProperty(name) && matches(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Field, name, phpGlobals.compiletimeconstants[name]));
			}
		}
		for (var name in phpGlobals.keywords) {
			if (phpGlobals.keywords.hasOwnProperty(name) && matches(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Keyword, name, phpGlobals.keywords[name]));
			}
		}

		var text = document.getText();
		if (prefix[0] === '$') {
			var variableMatch = /\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g;
			var match: RegExpExecArray = null;
			while (match = variableMatch.exec(text)) {
				var word = match[0];
				if (!added[word]) {
					added[word] = true;
					result.push(createNewProposal(CompletionItemKind.Variable, word, null));
				}
			}
		}
		var functionMatch = /function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g;
		var match: RegExpExecArray = null;
		while (match = functionMatch.exec(text)) {
			var word = match[1];
			if (!added[word]) {
				added[word] = true;
				result.push(createNewProposal(CompletionItemKind.Function, word, null));
			}
		}
		return Promise.resolve(result);
	}
}
