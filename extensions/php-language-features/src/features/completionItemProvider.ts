/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, Position, Range, TextDocument, workspace } from 'vscode';
import * as phpGlobalFunctions from './phpGlobalFunctions';
import * as phpGlobals from './phpGlobals';

export default class PHPCompletionItemProvider implements CompletionItemProvider {

	public provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken, context: CompletionContext): Promise<CompletionItem[]> {
		const result: CompletionItem[] = [];

		const shouldProvideCompletionItems = workspace.getConfiguration('php').get<boolean>('suggest.basic', true);
		if (!shouldProvideCompletionItems) {
			return Promise.resolve(result);
		}

		let range = document.getWordRangeAtPosition(position);
		const prefix = range ? document.getText(range) : '';
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

		const added: any = {};
		const createNewProposal = function (kind: CompletionItemKind, name: string, entry: phpGlobals.IEntry | null): CompletionItem {
			const proposal: CompletionItem = new CompletionItem(name);
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

		const matches = (name: string) => {
			return prefix.length === 0 || name.length >= prefix.length && name.substr(0, prefix.length) === prefix;
		};

		if (matches('php') && range.start.character >= 2) {
			const twoBeforePosition = new Position(range.start.line, range.start.character - 2);
			const beforeWord = document.getText(new Range(twoBeforePosition, range.start));

			if (beforeWord === '<?') {
				const proposal = createNewProposal(CompletionItemKind.Class, '<?php', null);
				proposal.insertText = '<?php';
				proposal.range = new Range(twoBeforePosition, position);
				result.push(proposal);
				return Promise.resolve(result);
			}
		}

		for (const globalvariables in phpGlobals.globalvariables) {
			if (phpGlobals.globalvariables.hasOwnProperty(globalvariables) && matches(globalvariables)) {
				added[globalvariables] = true;
				result.push(createNewProposal(CompletionItemKind.Variable, globalvariables, phpGlobals.globalvariables[globalvariables]));
			}
		}
		for (const globalfunctions in phpGlobalFunctions.globalfunctions) {
			if (phpGlobalFunctions.globalfunctions.hasOwnProperty(globalfunctions) && matches(globalfunctions)) {
				added[globalfunctions] = true;
				result.push(createNewProposal(CompletionItemKind.Function, globalfunctions, phpGlobalFunctions.globalfunctions[globalfunctions]));
			}
		}
		for (const compiletimeconstants in phpGlobals.compiletimeconstants) {
			if (phpGlobals.compiletimeconstants.hasOwnProperty(compiletimeconstants) && matches(compiletimeconstants)) {
				added[compiletimeconstants] = true;
				result.push(createNewProposal(CompletionItemKind.Field, compiletimeconstants, phpGlobals.compiletimeconstants[compiletimeconstants]));
			}
		}
		for (const keywords in phpGlobals.keywords) {
			if (phpGlobals.keywords.hasOwnProperty(keywords) && matches(keywords)) {
				added[keywords] = true;
				result.push(createNewProposal(CompletionItemKind.Keyword, keywords, phpGlobals.keywords[keywords]));
			}
		}

		const text = document.getText();
		if (prefix[0] === '$') {
			const variableMatch = /\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g;
			let match: RegExpExecArray | null = null;
			while (match = variableMatch.exec(text)) {
				const word = match[0];
				if (!added[word]) {
					added[word] = true;
					result.push(createNewProposal(CompletionItemKind.Variable, word, null));
				}
			}
		}
		const functionMatch = /function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g;
		let match2: RegExpExecArray | null = null;
		while (match2 = functionMatch.exec(text)) {
			const word2 = match2[1];
			if (!added[word2]) {
				added[word2] = true;
				result.push(createNewProposal(CompletionItemKind.Function, word2, null));
			}
		}
		return Promise.resolve(result);
	}
}
