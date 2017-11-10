/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HtmlNode } from 'EmmetNode';
import { isValidLocationForEmmetAbbreviation } from './abbreviationActions';
import { getEmmetHelper, getNode, getInnerRange, getMappingForIncludedLanguages, parseDocument, getEmmetConfiguration, getEmmetMode, isStyleSheet } from './util';

const allowedMimeTypesInScriptTag = ['text/html', 'text/plain', 'text/x-template', 'text/template'];

export class DefaultCompletionItemProvider implements vscode.CompletionItemProvider {

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList | undefined> | undefined {
		const mappedLanguages = getMappingForIncludedLanguages();
		const emmetConfig = vscode.workspace.getConfiguration('emmet');

		let isSyntaxMapped = mappedLanguages[document.languageId] ? true : false;
		let excludedLanguages = emmetConfig['excludeLanguages'] ? emmetConfig['excludeLanguages'] : [];
		let syntax = getEmmetMode((isSyntaxMapped ? mappedLanguages[document.languageId] : document.languageId), excludedLanguages);

		if (document.languageId === 'html' || isStyleSheet(document.languageId)) {
			// Document can be html/css parsed
			// Use syntaxHelper to parse file, validate location and update sytnax if needed
			syntax = this.syntaxHelper(syntax, document, position);
		}

		if (!syntax
			|| ((isSyntaxMapped || syntax === 'jsx')
				&& emmetConfig['showExpandedAbbreviation'] !== 'always')) {
			return;
		}

		const helper = getEmmetHelper();
		let noiseCheckPromise: Thenable<any> = Promise.resolve();

		// Fix for https://github.com/Microsoft/vscode/issues/32647
		// Check for document symbols in js/ts/jsx/tsx and avoid triggering emmet for abbreviations of the form symbolName.sometext
		// Presence of > or * or + in the abbreviation denotes valid abbreviation that should trigger emmet
		if (!isStyleSheet(syntax) && (document.languageId === 'javascript' || document.languageId === 'javascriptreact' || document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
			let extractAbbreviationResults = helper.extractAbbreviation(document, position);
			if (extractAbbreviationResults) {
				let abbreviation: string = extractAbbreviationResults.abbreviation;
				if (abbreviation.startsWith('this.')) {
					noiseCheckPromise = Promise.resolve(true);
				} else {
					noiseCheckPromise = vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri).then((symbols: vscode.SymbolInformation[] | undefined) => {
						return symbols && symbols.find(x => abbreviation === x.name || (abbreviation.startsWith(x.name + '.') && !/>|\*|\+/.test(abbreviation)));
					});
				}
			}
		}

		return noiseCheckPromise.then(noise => {
			if (noise) {
				return;
			}

			let result = helper.doComplete(document, position, syntax, getEmmetConfiguration(syntax));
			let newItems: vscode.CompletionItem[] = [];
			if (result && result.items) {
				result.items.forEach(item => {
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

			return Promise.resolve(new vscode.CompletionList(newItems, true));
		});
	}

	/**
	 * Parses given document to check whether given position is valid for emmet abbreviation and returns appropriate syntax
	 * @param syntax string language mode of current document
	 * @param document vscode.Textdocument
	 * @param position vscode.Position position of the abbreviation that needs to be expanded
	 */
	private syntaxHelper(syntax: string | undefined, document: vscode.TextDocument, position: vscode.Position): string | undefined {
		if (!syntax) {
			return syntax;
		}
		let rootNode = parseDocument(document, false);
		if (!rootNode) {
			return;
		}

		let currentNode = getNode(rootNode, position, true);

		if (!isStyleSheet(syntax)) {
			const currentHtmlNode = <HtmlNode>currentNode;
			if (currentHtmlNode
				&& currentHtmlNode.close
				&& getInnerRange(currentHtmlNode).contains(position)) {
				if (currentHtmlNode.name === 'style') {
					return 'css';
				}
				if (currentHtmlNode.name === 'script') {
					if (currentHtmlNode.attributes
						&& currentHtmlNode.attributes.some(x => x.name.toString() === 'type' && allowedMimeTypesInScriptTag.indexOf(x.value.toString()) > -1)) {
						return syntax;
					}
					return;
				}
			}
		}

		if (!isValidLocationForEmmetAbbreviation(currentNode, syntax, position)) {
			return;
		}
		return syntax;
	}




}