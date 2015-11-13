/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {CompletionItemProvider, CompletionItem, CompletionItemKind, CancellationToken, TextDocument, Range, Position} from 'vscode';
import phpGlobals = require('./phpGlobals');

export default class PHPCompletionItemProvider implements CompletionItemProvider {

	public triggerCharacters = ['.', ':', '$'];

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
		let result: CompletionItem[] = [];

		var added : any = {};
		var createNewProposal = function(kind: CompletionItemKind, name: string, entry: phpGlobals.IEntry) : CompletionItem  {
			var proposal : CompletionItem = new CompletionItem(name);
			proposal.kind = kind;
			if (entry) {
				if (entry.description) {
					proposal.documentation= entry.description;
				}
				if (entry.signature) {
					proposal.detail = entry.signature;
				}
			}
			return proposal;
		};

		for (var name in phpGlobals.globalvariables) {
			if (phpGlobals.globalvariables.hasOwnProperty(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Variable, name, phpGlobals.globalvariables[name]));
			}
		}
		for (var name in phpGlobals.globalfunctions) {
			if (phpGlobals.globalfunctions.hasOwnProperty(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Function, name, phpGlobals.globalfunctions[name]));
			}
		}
		for (var name in phpGlobals.compiletimeconstants) {
			if (phpGlobals.compiletimeconstants.hasOwnProperty(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Field, name, phpGlobals.compiletimeconstants[name]));
			}
		}
		for (var name in phpGlobals.keywords) {
			if (phpGlobals.keywords.hasOwnProperty(name)) {
				added[name] = true;
				result.push(createNewProposal(CompletionItemKind.Keyword, name, phpGlobals.keywords[name]));
			}
		}

		var text = document.getText();
		var variableMatch = /\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g;
		var match : RegExpExecArray = null;
		while (match = variableMatch.exec(text)) {
			var word = match[0];
			if (!added[word]) {
				result.push(createNewProposal(CompletionItemKind.Variable, name, null));
			}
		}
		return Promise.resolve(result);
	}
}
