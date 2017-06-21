/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { expand, createSnippetsRegistry } from '@emmetio/expand-abbreviation';
import { isStyleSheet, extractAbbreviation, getExpandOptions } from './abbreviationUtil';

const snippetKeyCache = new Map<string, string[]>();

export class EmmetCompletionItemProvider implements vscode.CompletionItemProvider {
	private _syntax: string;
	constructor(syntax: string) {
		if (syntax) {
			this._syntax = syntax;
		}
	}
	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {

		let emmetConfig = vscode.workspace.getConfiguration('emmet');
		if (!emmetConfig['useNewEmmet'] || !emmetConfig['showExpandedAbbreviation']) {
			return Promise.resolve(null);
		}

		let [abbreviationRange, abbreviation] = extractAbbreviation(document, position);
		let expandedText = expand(abbreviation, getExpandOptions(this._syntax));

		if (!expandedText) {
			return;
		}

		let expandedAbbr = new vscode.CompletionItem(abbreviation);
		expandedAbbr.insertText = new vscode.SnippetString(expandedText);
		expandedAbbr.documentation = this.removeTabStops(expandedText);
		expandedAbbr.range = abbreviationRange;
		expandedAbbr.detail = 'Emmet Abbreviation';

		// Workaround for the main expanded abbr not appearing before the snippet suggestions
		expandedAbbr.sortText = '0' + expandedAbbr.label;

		let completionItems: vscode.CompletionItem[] = expandedAbbr ? [expandedAbbr] : [];
		if (!isStyleSheet(this._syntax)) {
			let currentWord = this.getCurrentWord(document, position);
			let abbreviationSuggestions = this.getAbbreviationSuggestions(this._syntax, currentWord, abbreviation, abbreviationRange);
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
			item.documentation = this.removeTabStops(expandedAbbr);
			item.detail = 'Emmet Abbreviation';
			item.insertText = new vscode.SnippetString(expandedAbbr);
			item.range = abbreviationRange;

			// Workaround for snippet suggestions items getting filtered out as the complete abbr does not start with snippetKey 
			item.filterText = abbreviation;

			// Workaround for the main expanded abbr not appearing before the snippet suggestions
			item.sortText = '9' + abbreviation;

			snippetCompletions.push(item);
		});

		return snippetCompletions;

	}

	private getCurrentWord(document: vscode.TextDocument, position: vscode.Position): string {
		let wordAtPosition = document.getWordRangeAtPosition(position);
		let currentWord = '';
		if (wordAtPosition && wordAtPosition.start.character < position.character) {
			let word = document.getText(wordAtPosition);
			currentWord = word.substr(0, position.character - wordAtPosition.start.character);
		}

		return currentWord;
	}

	private removeTabStops(expandedWord: string): string {
		return expandedWord.replace(/\$\{\d+\}/g, '').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
	}

}








