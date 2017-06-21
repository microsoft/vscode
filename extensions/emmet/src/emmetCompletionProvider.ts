/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { expand, createSnippetsRegistry } from '@emmetio/expand-abbreviation';
import { getSyntax, isStyleSheet } from './util';
import { syntaxHelper, expandAbbreviationHelper, ExpandAbbreviationHelperOutput, getExpandOptions } from './abbreviationActions';

const snippetKeyCache = new Map<string, string[]>();

export class EmmetCompletionItemProvider implements vscode.CompletionItemProvider {
	private _mappedSyntax = false;
	constructor(mappedSyntax?: boolean) {
		if (mappedSyntax) {
			this._mappedSyntax = true;
		}
	}
	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {

		let emmetConfig = vscode.workspace.getConfiguration('emmet');
		if (!emmetConfig['useNewEmmet'] || !emmetConfig['showExpandedAbbreviation']) {
			return Promise.resolve(null);
		}

		let syntax = getSyntax(document);
		let abbreviationRange = new vscode.Range(position, position);
		if (!this._mappedSyntax) {
			syntax = syntaxHelper(syntax, document, position);
		}

		let output: ExpandAbbreviationHelperOutput = expandAbbreviationHelper(syntax, document, abbreviationRange);
		if (!output) {
			return;
		}

		let expandedAbbr = new vscode.CompletionItem(output.abbreviation);
		expandedAbbr.insertText = new vscode.SnippetString(output.expandedText);
		expandedAbbr.documentation = removeTabStops(output.expandedText);
		expandedAbbr.range = output.abbreviationRange;
		expandedAbbr.detail = 'Emmet Abbreviation';

		// Workaround for completion items appearing out of order
		expandedAbbr.sortText = '0' + expandedAbbr.label;

		syntax = output.syntax;

		let completionItems: vscode.CompletionItem[] = expandedAbbr ? [expandedAbbr] : [];
		if (!isStyleSheet(syntax)) {
			let currentWord = getCurrentWord(document, position);
			let abbreviationSuggestions = this.getAbbreviationSuggestions(syntax, currentWord, output.abbreviation, output.abbreviationRange);
			completionItems = completionItems.concat(abbreviationSuggestions);
		}
		return Promise.resolve(new vscode.CompletionList(completionItems, true));


	}
	getAbbreviationSuggestions(syntax: string, prefix: string, abbreviation: string, abbreviationRange: vscode.Range): vscode.CompletionItem[] {
		if (!vscode.workspace.getConfiguration('emmet')['showAbbreviationSuggestions'] || !prefix || !abbreviation) {
			return [];
		}

		if (!snippetKeyCache.has(syntax)) {
			let registry = createSnippetsRegistry(syntax);
			let snippetKeys: string[] = registry.all({ type: 'string' }).map(snippet => {
				return snippet.key;
			});
			snippetKeyCache.set(syntax, snippetKeys);
		}

		let snippetKeys = snippetKeyCache.get(syntax);
		let snippetCompletions = [];
		snippetKeys.forEach(snippetKey => {
			if (!snippetKey.startsWith(prefix) || snippetKey === prefix) {
				return;
			}

			let currentAbbr = abbreviation + snippetKey.substr(prefix.length);
			let expandedAbbr = expand(currentAbbr, getExpandOptions(syntax));

			let item = new vscode.CompletionItem(snippetKey);
			item.documentation = removeTabStops(expandedAbbr);
			item.detail = 'Emmet Abbreviation';
			item.insertText = new vscode.SnippetString(expandedAbbr);
			item.range = abbreviationRange;

			// Workaround for completion items getting filtered out
			item.filterText = abbreviation;

			// Workaround for completion items appearing in wrong order
			item.sortText = '9' + abbreviation;

			snippetCompletions.push(item);
		});

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




