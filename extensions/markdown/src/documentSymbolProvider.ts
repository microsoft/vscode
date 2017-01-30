/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { MarkdownEngine } from './markdownEngine';
import { TableOfContentProvider } from './tableOfContentsProvider';

export default class MDDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

	constructor(private engine: MarkdownEngine) { }

	provideDocumentSymbols(document: vscode.TextDocument): vscode.ProviderResult<vscode.SymbolInformation[]> {
		const toc = new TableOfContentProvider(this.engine, document);
		return toc.getToc().map(entry => {
			return new vscode.SymbolInformation(entry.text, vscode.SymbolKind.Module, '', entry.location);
		});
	}
}