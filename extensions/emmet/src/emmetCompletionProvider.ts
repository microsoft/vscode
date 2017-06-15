/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { expand, createSnippetsRegistry } from '@emmetio/expand-abbreviation';
import { getSyntax, getProfile, extractAbbreviation } from './util';

const field = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;
const snippetCompletionsCache = new Map<string, vscode.CompletionItem[]>();

export abstract class EmmetCompletionItemProviderBase implements vscode.CompletionItemProvider {

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {

		if (!vscode.workspace.getConfiguration('emmet')['useNewEmmet']) {
			return Promise.resolve(null);
		}

		let currentWord = getCurrentWord(document, position);
		let expandedAbbr = this.getExpandedAbbreviation(document, position);
		let abbreviationSuggestions = this.getAbbreviationSuggestions(getSyntax(document), currentWord, (expandedAbbr && currentWord === expandedAbbr.label));
		let completionItems = expandedAbbr ? [expandedAbbr, ...abbreviationSuggestions] : abbreviationSuggestions;

		return Promise.resolve(new vscode.CompletionList(completionItems, true));
	}

	protected getExpandedAbbreviation(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem {
		if (!vscode.workspace.getConfiguration('emmet')['showExpandedAbbreviation']) {
			return;
		}
		let [rangeToReplace, wordToExpand] = extractAbbreviation(position);
		if (!rangeToReplace || !wordToExpand) {
			return;
		}
		let syntax = getSyntax(document);
		let expandedWord = expand(wordToExpand, {
			field: field,
			syntax: syntax,
			profile: getProfile(syntax),
			addons: syntax === 'jsx' ? { 'jsx': true } : null
		});

		let completionitem = new vscode.CompletionItem(wordToExpand);
		completionitem.insertText = new vscode.SnippetString(expandedWord);
		completionitem.documentation = removeTabStops(expandedWord);
		completionitem.range = rangeToReplace;
		completionitem.detail = 'Expand Emmet Abbreviation';


		return completionitem;
	}

	abstract getAbbreviationSuggestions(syntax: string, prefix: string, skipExactMatch: boolean): vscode.CompletionItem[];

}

export class EmmetCompletionItemProviderHtml extends EmmetCompletionItemProviderBase {

	protected getExpandedAbbreviation(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem {
		let completionItem = super.getExpandedAbbreviation(document, position);

		if (completionItem) {
			// In non stylesheet like syntax, this extension returns expanded abbr plus posssible abbr completions
			// To differentiate between the 2, the former is given CompletionItemKind.Value so that it gets a different icon
			completionItem.kind = vscode.CompletionItemKind.Value;
		}


		return completionItem;
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

export class EmmetCompletionItemProviderCss extends EmmetCompletionItemProviderBase {
	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {
		return super.provideCompletionItems(document, position, token);
	}

	getAbbreviationSuggestions(syntax: string, prefix: string, skipExactMatch: boolean) {
		return [];
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




