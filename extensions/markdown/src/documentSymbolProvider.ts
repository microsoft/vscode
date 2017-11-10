/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { MarkdownEngine } from './markdownEngine';
import { TableOfContentsProvider } from './tableOfContentsProvider';

export default class MDDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

	constructor(
		private engine: MarkdownEngine
	) { }

	public async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.SymbolInformation[]> {
		const toc = await new TableOfContentsProvider(this.engine, document).getToc();
		return toc.map(entry => {
			return new vscode.SymbolInformation('#'.repeat(entry.level) + ' ' + entry.text, vscode.SymbolKind.Namespace, '', entry.location);
		});
	}
}