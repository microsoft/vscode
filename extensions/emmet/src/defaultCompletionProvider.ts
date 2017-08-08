/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HtmlNode } from 'EmmetNode';
import { doComplete, isStyleSheet, getEmmetMode } from 'vscode-emmet-helper';
import { isValidLocationForEmmetAbbreviation } from './abbreviationActions';
import { getNode, getInnerRange, getMappingForIncludedLanguages, parseDocument, getEmmetConfiguration } from './util';

export class DefaultCompletionItemProvider implements vscode.CompletionItemProvider {

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {
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

		let result: vscode.CompletionList = doComplete(document, position, syntax, getEmmetConfiguration());
		let newItems: vscode.CompletionItem[] = [];
		if (result.items) {
			result.items.forEach(item => {
				let newItem = new vscode.CompletionItem(item.label);
				newItem.documentation = item.documentation;
				newItem.detail = item.detail;
				newItem.insertText = new vscode.SnippetString(item.textEdit.newText);
				let oldrange = item.textEdit.range;
				newItem.range = new vscode.Range(oldrange.start.line, oldrange.start.character, oldrange.end.line, oldrange.end.character);

				newItem.filterText = item.filterText;
				newItem.sortText = item.sortText;
				newItems.push(newItem);
			});
		}

		return Promise.resolve(new vscode.CompletionList(newItems, true));
	}

	/**
	 * Parses given document to check whether given position is valid for emmet abbreviation and returns appropriate syntax
	 * @param syntax string language mode of current document
	 * @param document vscode.Textdocument
	 * @param position vscode.Position position of the abbreviation that needs to be expanded
	 */
	private syntaxHelper(syntax: string, document: vscode.TextDocument, position: vscode.Position): string {
		if (!syntax) {
			return syntax;
		}
		let rootNode = parseDocument(document, false);
		if (!rootNode) {
			return;
		}

		let currentNode = getNode(rootNode, position);

		if (!isStyleSheet(syntax)) {
			const currentHtmlNode = <HtmlNode>currentNode;
			if (currentHtmlNode
				&& currentHtmlNode.close
				&& currentHtmlNode.name === 'style'
				&& getInnerRange(currentHtmlNode).contains(position)) {
				return 'css';
			}
		}

		if (!isValidLocationForEmmetAbbreviation(currentNode, syntax, position)) {
			return;
		}
		return syntax;
	}




}