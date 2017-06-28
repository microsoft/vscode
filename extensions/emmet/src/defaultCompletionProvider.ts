/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parseStylesheet from '@emmetio/css-parser';
import parse from '@emmetio/html-matcher';
import { Node, HtmlNode } from 'EmmetNode';
import { DocumentStreamReader } from './bufferStream';
import { EmmetCompletionItemProvider, isStyleSheet, getEmmetMode } from 'vscode-emmet-helper';
import { isValidLocationForEmmetAbbreviation } from './abbreviationActions';
import { getNode, getInnerRange, getMappingForIncludedLanguages } from './util';

export class DefaultCompletionItemProvider implements vscode.CompletionItemProvider {

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {
		const mappedLanguages = getMappingForIncludedLanguages();

		let isSyntaxMapped = mappedLanguages[document.languageId] ? true : false;
		let syntax = getEmmetMode(isSyntaxMapped ? mappedLanguages[document.languageId] : document.languageId);

		if (document.languageId === 'html' || isStyleSheet(document.languageId)) {
			// Document can be html/css parsed
			// Use syntaxHelper to parse file, validate location and update sytnax if needed
			syntax = this.syntaxHelper(syntax, document, position);
		}

		if (!syntax || (isSyntaxMapped && vscode.workspace.getConfiguration('emmet')['showExpandedAbbreviation'] !== 'always')) {
			return;
		}

		const emmetCompletionProvider = new EmmetCompletionItemProvider(syntax);
		return emmetCompletionProvider.provideCompletionItems(document, position, token);
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
		let parseContent = isStyleSheet(syntax) ? parseStylesheet : parse;
		let rootNode: Node = parseContent(new DocumentStreamReader(document));
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