/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, WorkspaceSymbolProvider, SymbolInformation, TextDocument, Disposable } from 'vscode';
import { isMarkdownFile } from '../util/file';
import MDDocumentSymbolProvider from './documentSymbolProvider';

export default class MarkdownWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
	private symbolProvider: MDDocumentSymbolProvider;
	private symbolCache = new Map<string, SymbolInformation[]>();
	private symbolCachePopulated: boolean;
	private deRegisterOnSaveEvent: Disposable;

	public constructor(symbolProvider: MDDocumentSymbolProvider) {
		this.symbolProvider = symbolProvider;
		this.symbolCachePopulated = false;
		this.deRegisterOnSaveEvent = this.registerOnSaveEvent();
	}

	public async provideWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
		if (!this.symbolCachePopulated) {
			await this.populateSymbolCache();
			this.symbolCachePopulated = true;
		}

		return Array.prototype.concat.apply([], Array.from(this.symbolCache.values())
			.filter(symbols => symbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1)));
	}

	public async populateSymbolCache(): Promise<void> {
		const markDownDocumentUris = await workspace.findFiles('**/*.md');
		for (const uri of markDownDocumentUris) {
			const document = await workspace.openTextDocument(uri);
			if (isMarkdownFile(document)) {
				const symbols = await this.getSymbol(document);
				this.symbolCache.set(document.fileName, symbols);
			}
		}
	}

	public dispose(): void {
		this.deRegisterOnSaveEvent.dispose();
	}

	private async getSymbol(document: TextDocument): Promise<SymbolInformation[]> {
		return this.symbolProvider.provideDocumentSymbols(document);
	}

	private registerOnSaveEvent(): Disposable {
		return workspace.onDidSaveTextDocument(async document => {
			if (isMarkdownFile(document)) {
				const symbols = await this.getSymbol(document);
				this.symbolCache.set(document.fileName, symbols);
			}
		});
	}

}