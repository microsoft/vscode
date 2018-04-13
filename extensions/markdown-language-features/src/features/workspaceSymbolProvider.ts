/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, SymbolInformation, TextDocument, Uri, WorkspaceSymbolProvider, workspace } from 'vscode';
import { disposeAll } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import MDDocumentSymbolProvider from './documentSymbolProvider';

export interface WorkspaceMarkdownDocumentProvider {
	getAllMarkdownDocuments(): Thenable<Uri[]>;
}

class VSCodeWorkspaceMarkdownDocumentProvider implements WorkspaceMarkdownDocumentProvider {
	getAllMarkdownDocuments() {
		return workspace.findFiles('**/*.md');
	}
}


export default class MarkdownWorkspaceSymbolProvider implements WorkspaceSymbolProvider {
	private _symbolCache = new Map<string, SymbolInformation[]>();
	private _symbolCachePopulated: boolean = false;
	private _disposables: Disposable[] = [];

	public constructor(
		private _symbolProvider: MDDocumentSymbolProvider,
		private _workspaceMarkdownDocumentProvider: WorkspaceMarkdownDocumentProvider = new VSCodeWorkspaceMarkdownDocumentProvider()
	) { }

	public async provideWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
		if (!this._symbolCachePopulated) {
			await this.populateSymbolCache();
			this._symbolCachePopulated = true;

			const watcher = workspace.createFileSystemWatcher('**/*.md');
			this._disposables.push(watcher);
			watcher.onDidChange(this.onDidChange, this, this._disposables);
		}

		return Array.prototype.concat.apply([], Array.from(this._symbolCache.values())
			.filter(symbols => symbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1)));
	}

	public async populateSymbolCache(): Promise<void> {
		const markDownDocumentUris = await this._workspaceMarkdownDocumentProvider.getAllMarkdownDocuments();
		for (const uri of markDownDocumentUris) {
			const document = await workspace.openTextDocument(uri);
			if (isMarkdownFile(document)) {
				const symbols = await this.getSymbol(document);
				this._symbolCache.set(document.fileName, symbols);
			}
		}
	}

	public dispose(): void {
		disposeAll(this._disposables);
	}

	private async getSymbol(document: TextDocument): Promise<SymbolInformation[]> {
		return this._symbolProvider.provideDocumentSymbols(document);
	}

	private async onDidChange(resource: Uri) {
		const document = await workspace.openTextDocument(resource);
		if (isMarkdownFile(document)) {
			const symbols = await this.getSymbol(document);
			this._symbolCache.set(document.fileName, symbols);
		}
	}
}