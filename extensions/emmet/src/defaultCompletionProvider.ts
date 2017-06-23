/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parseStylesheet from '@emmetio/css-parser';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { DocumentStreamReader } from './bufferStream';
import { EmmetCompletionItemProvider, isStyleSheet } from 'vscode-emmet-helper';
import { isValidLocationForEmmetAbbreviation } from './abbreviationActions';
import { getSyntax, getNode, getInnerRange } from './util';

export class DefaultCompletionItemProvider implements vscode.CompletionItemProvider {
	private _mappedSyntax = false;
	constructor(mappedSyntax?: boolean) {
		if (mappedSyntax) {
			this._mappedSyntax = mappedSyntax;
		}
	}
	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList> {
		let syntax = getSyntax(document);
		if (!this._mappedSyntax) {
			syntax = this.syntaxHelper(syntax, document, position);
		}
		if (!syntax) {
			return;
		}

		const emmetCompletionProvider = new EmmetCompletionItemProvider(syntax);
		return emmetCompletionProvider.provideCompletionItems(document, position, token);
	}

	/**
	 * Checks whether given position is valid for emmet abbreviation and returns appropriate syntax
	 * @param syntax string language mode of current document
	 * @param document vscode.Textdocument
	 * @param position vscode.Position position of the abbreviation that needs to be expanded
	 */
	private syntaxHelper(syntax: string, document: vscode.TextDocument, position: vscode.Position): string {
		let parseContent = isStyleSheet(syntax) ? parseStylesheet : parse;
		let rootNode: Node = parseContent(new DocumentStreamReader(document));
		let currentNode = getNode(rootNode, position);

		if (!isStyleSheet(syntax)
			&& currentNode
			&& currentNode.close
			&& currentNode.name === 'style'
			&& getInnerRange(currentNode).contains(position)) {
			return 'css';
		}

		if (!isValidLocationForEmmetAbbreviation(currentNode, syntax, position)) {
			return;
		}
		return syntax;
	}




}