/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { disposeAll } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import MDDocumentSymbolProvider from './documentSymbolProvider';

export interface WorkspaceMarkdownDocumentProvider {
	getAllMarkdownDocuments(): Thenable<vscode.TextDocument[]>;
}

class VSCodeWorkspaceMarkdownDocumentProvider implements WorkspaceMarkdownDocumentProvider {
	async getAllMarkdownDocuments() {
		const resources = await vscode.workspace.findFiles('**/*.md');
		const documents = await Promise.all(
			resources.map(resource => vscode.workspace.openTextDocument(resource).then(x => x, () => undefined)));
		return documents.filter(doc => doc && isMarkdownFile(doc)) as vscode.TextDocument[];
	}
}


export default class MarkdownWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	private _symbolCache = new Map<string, vscode.SymbolInformation[]>();
	private _symbolCachePopulated: boolean = false;
	private _disposables: vscode.Disposable[] = [];

	public constructor(
		private _symbolProvider: MDDocumentSymbolProvider,
		private _workspaceMarkdownDocumentProvider: WorkspaceMarkdownDocumentProvider = new VSCodeWorkspaceMarkdownDocumentProvider()
	) { }

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		if (!this._symbolCachePopulated) {
			await this.populateSymbolCache();
			this._symbolCachePopulated = true;

			const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
			this._disposables.push(watcher);
			watcher.onDidChange(this.onDidChange, this, this._disposables);
		}

		return Array.prototype.concat.apply([], Array.from(this._symbolCache.values())
			.filter(symbols => symbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1)));
	}

	public async populateSymbolCache(): Promise<void> {
		const markDownDocumentUris = await this._workspaceMarkdownDocumentProvider.getAllMarkdownDocuments();
		for (const document of markDownDocumentUris) {
			const symbols = await this.getSymbol(document);
			this._symbolCache.set(document.fileName, symbols);
		}
	}

	public dispose(): void {
		disposeAll(this._disposables);
	}

	private async getSymbol(document: vscode.TextDocument): Promise<vscode.SymbolInformation[]> {
		return this._symbolProvider.provideDocumentSymbols(document);
	}

	private async onDidChange(resource: vscode.Uri) {
		const document = await vscode.workspace.openTextDocument(resource);
		if (isMarkdownFile(document)) {
			const symbols = await this.getSymbol(document);
			this._symbolCache.set(document.fileName, symbols);
		}
	}
}