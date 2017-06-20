/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { expand, createSnippetsRegistry } from '@emmetio/expand-abbreviation';
import { getSyntax, isStyleSheet } from './util';
import { expandAbbreviationHelper, ExpandAbbreviationHelperOutput } from './abbreviationActions';

const field = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;
const snippetCompletionsCache = new Map<string, vscode.CompletionItem[]>();

export class EmmetCompletionItemProvider implements vscode.CompletionItemProvider {

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {

		if (!vscode.workspace.getConfiguration('emmet')['useNewEmmet']) {
			return Promise.resolve(null);
		}

		let syntax = getSyntax(document);
		let expandedAbbr: vscode.CompletionItem;
		if (vscode.workspace.getConfiguration('emmet')['showExpandedAbbreviation']) {
			let output: ExpandAbbreviationHelperOutput = expandAbbreviationHelper(syntax, document, new vscode.Range(position, position));
			if (output) {
				expandedAbbr = new vscode.CompletionItem(output.abbreviation);
				expandedAbbr.insertText = new vscode.SnippetString(output.expandedText);
				expandedAbbr.documentation = removeTabStops(output.expandedText);
				expandedAbbr.range = output.rangeToReplace;
				expandedAbbr.detail = 'Expand Emmet Abbreviation';
				syntax = output.syntax;
			}
		}

		let completionItems: vscode.CompletionItem[] = expandedAbbr ? [expandedAbbr] : [];
		if (!isStyleSheet(syntax)) {
			if (expandedAbbr) {
				// In non stylesheet like syntax, this extension returns expanded abbr plus posssible abbr completions
				// To differentiate between the 2, the former is given CompletionItemKind.Value so that it gets a different icon
				expandedAbbr.kind = vscode.CompletionItemKind.Value;
			}
			let currentWord = getCurrentWord(document, position);

			let abbreviationSuggestions = this.getAbbreviationSuggestions(syntax, currentWord, (expandedAbbr && currentWord === expandedAbbr.label));
			completionItems = completionItems.concat(abbreviationSuggestions);
		}

		return Promise.resolve(new vscode.CompletionList(completionItems, true));
	}
	getAbbreviationSuggestions(syntax: string, prefix: string, skipExactMatch: boolean) {
		if (!vscode.workspace.getConfiguration('emmet')['showAbbreviationSuggestions'] || !prefix) {
			return [];
		}

		if (!snippetCompletionsCache.has(syntax)) {
			let registry = createSnippetsRegistry(syntax);
			let completions: vscode.CompletionItem[] = registry.all({ type: 'string' }).map(snippet => {
				let expandedWord = expand(snippet.value, {
					field: field,
					syntax: syntax
				});

				let item = new vscode.CompletionItem(snippet.key);
				item.documentation = removeTabStops(expandedWord);
				item.detail = 'Complete Emmet Abbreviation';
				item.insertText = snippet.key;
				return item;
			});
			snippetCompletionsCache.set(syntax, completions);
		}

		let snippetCompletions = snippetCompletionsCache.get(syntax);

		snippetCompletions = snippetCompletions.filter(x => x.label.startsWith(prefix) && (!skipExactMatch || x.label !== prefix));

		return snippetCompletions;

	}

}



function getCurrentWord(document: vscode.TextDocument, position: vscode.Position): string {
	let wordAtPosition = document.getWordRangeAtPosition(position);
	let currentWord = '';
	if (wordAtPosition && wordAtPosition.start.character < position.character) {
		let word = document.getText(wordAtPosition);
		currentWord = word.substr(0, position.character - wordAtPosition.start.character);
	}

	return currentWord;
}

function removeTabStops(expandedWord: string): string {
	return expandedWord.replace(/\$\{\d+\}/g, '').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}




