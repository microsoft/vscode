/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { MarkdownEngine } from './markdownEngine';

export default class MDDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

	constructor(private engine: MarkdownEngine) { }

	provideDocumentSymbols(document: vscode.TextDocument): vscode.ProviderResult<vscode.SymbolInformation[]> {
		const tokens = this.engine.parse(document.getText());
		const headings = tokens.filter(token => token.type === 'heading_open');

		return headings.map(heading => {
			const lineNumber = heading.map[0];
			const line = document.lineAt(lineNumber);
			const location = new vscode.Location(document.uri, line.range);

			// # Header        => 'Header'
			// ## Header ##    => 'Header'
			// ## Header ####  => 'Header'
			// Header ##       => 'Header ##'
			// =========
			const text = line.text.replace(/^\s*(#)+\s*(.*?)\s*\1*$/, '$2');

			return new vscode.SymbolInformation(text, vscode.SymbolKind.Module, '', location);
		});
	}
}