/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, SymbolInformation, TextDocument, Uri, WorkspaceSymbolProvider, workspace } from 'vscode';
import { disposeAll } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import MDDocumentSymbolProvider from './documentSymbolProvider';

export default class MarkdownWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
	private symbolProvider: MDDocumentSymbolProvider;
	private symbolCache = new Map<string, SymbolInformation[]>();
	private symbolCachePopulated: boolean;
	private disposables: Disposable[] = [];

	public constructor(symbolProvider: MDDocumentSymbolProvider) {
		this.symbolProvider = symbolProvider;
		this.symbolCachePopulated = false;
	}

	public async provideWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
		if (!this.symbolCachePopulated) {
			await this.populateSymbolCache();
			this.symbolCachePopulated = true;

			const watcher = workspace.createFileSystemWatcher('**/*.md');
			this.disposables.push(watcher);
			watcher.onDidChange(this.onDidChange, this, this.disposables);
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
		disposeAll(this.disposables);
	}

	private async getSymbol(document: TextDocument): Promise<SymbolInformation[]> {
		return this.symbolProvider.provideDocumentSymbols(document);
	}

	private async onDidChange(resource: Uri) {
		const document = await workspace.openTextDocument(resource);
		if (isMarkdownFile(document)) {
			const symbols = await this.getSymbol(document);
			this.symbolCache.set(document.fileName, symbols);
		}
	}
}