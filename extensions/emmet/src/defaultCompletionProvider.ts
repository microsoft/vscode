/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Node } from 'EmmetNode';
import { isValidLocationForEmmetAbbreviation } from './abbreviationActions';
import { getEmmetHelper, getNode, getMappingForIncludedLanguages, parseDocument, getEmmetConfiguration, getEmmetMode, isStyleSheet } from './util';

export class DefaultCompletionItemProvider implements vscode.CompletionItemProvider {

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList | undefined> | undefined {
		const emmetConfig = vscode.workspace.getConfiguration('emmet');
		const excludedLanguages = emmetConfig['excludeLanguages'] ? emmetConfig['excludeLanguages'] : [];
		if (excludedLanguages.indexOf(document.languageId) > -1) {
			return;
		}

		const mappedLanguages = getMappingForIncludedLanguages();
		const isSyntaxMapped = mappedLanguages[document.languageId] ? true : false;
		let syntax = getEmmetMode((isSyntaxMapped ? mappedLanguages[document.languageId] : document.languageId), excludedLanguages);

		if (!syntax
			|| emmetConfig['showExpandedAbbreviation'] === 'never'
			|| ((isSyntaxMapped || syntax === 'jsx') && emmetConfig['showExpandedAbbreviation'] !== 'always')) {
			return;
		}

		const helper = getEmmetHelper();
		const extractAbbreviationResults = helper.extractAbbreviation(document, position, !isStyleSheet(syntax));
		if (!extractAbbreviationResults) {
			return;
		}

		let validateLocation = syntax === 'html';
		let currentNode: Node | null = null;

		// If document can be css parsed, get currentNode
		if (isStyleSheet(document.languageId)) {
			const rootNode = parseDocument(document, false);
			if (!rootNode) {
				return;
			}

			currentNode = getNode(rootNode, position, true);
			validateLocation = true;
		}

		if (validateLocation && !isValidLocationForEmmetAbbreviation(document, currentNode, syntax, position, extractAbbreviationResults.abbreviationRange)) {
			return;
		}

		let noiseCheckPromise: Thenable<any> = Promise.resolve();

		// Fix for https://github.com/Microsoft/vscode/issues/32647
		// Check for document symbols in js/ts/jsx/tsx and avoid triggering emmet for abbreviations of the form symbolName.sometext
		// Presence of > or * or + in the abbreviation denotes valid abbreviation that should trigger emmet
		if (!isStyleSheet(syntax) && (document.languageId === 'javascript' || document.languageId === 'javascriptreact' || document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
			let abbreviation: string = extractAbbreviationResults.abbreviation;
			if (abbreviation.startsWith('this.')) {
				noiseCheckPromise = Promise.resolve(true);
			} else {
				noiseCheckPromise = vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri).then((symbols: vscode.SymbolInformation[] | undefined) => {
					return symbols && symbols.find(x => abbreviation === x.name || (abbreviation.startsWith(x.name + '.') && !/>|\*|\+/.test(abbreviation)));
				});
			}
		}

		return noiseCheckPromise.then((noise): vscode.CompletionList | undefined => {
			if (noise) {
				return;
			}

			let result = helper.doComplete(document, position, syntax, getEmmetConfiguration(syntax!));
			let newItems: vscode.CompletionItem[] = [];
			if (result && result.items) {
				result.items.forEach((item: any) => {
					let newItem = new vscode.CompletionItem(item.label);
					newItem.documentation = item.documentation;
					newItem.detail = item.detail;
					newItem.insertText = new vscode.SnippetString(item.textEdit.newText);
					let oldrange = item.textEdit.range;
					newItem.range = new vscode.Range(oldrange.start.line, oldrange.start.character, oldrange.end.line, oldrange.end.character);

					newItem.filterText = item.filterText;
					newItem.sortText = item.sortText;

					if (emmetConfig['showSuggestionsAsSnippets'] === true) {
						newItem.kind = vscode.CompletionItemKind.Snippet;
					}
					newItems.push(newItem);
				});
			}

			return new vscode.CompletionList(newItems, true);
		});
	}






}