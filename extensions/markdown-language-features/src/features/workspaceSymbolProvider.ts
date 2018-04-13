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

	onDidChangeMarkdownDocument: vscode.Event<vscode.TextDocument>;
}

class VSCodeWorkspaceMarkdownDocumentProvider implements WorkspaceMarkdownDocumentProvider {

	private readonly _onDidChangeMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>();
	private _watcher: vscode.FileSystemWatcher | undefined;
	private _disposables: vscode.Disposable[] = [];

	public dispose() {
		this._onDidChangeMarkdownDocumentEmitter.dispose();

		if (this._watcher) {
			this._watcher.dispose();
		}

		disposeAll(this._disposables);
	}

	async getAllMarkdownDocuments() {
		const resources = await vscode.workspace.findFiles('**/*.md');
		const documents = await Promise.all(
			resources.map(resource => vscode.workspace.openTextDocument(resource).then(x => x, () => undefined)));
		return documents.filter(doc => doc && isMarkdownFile(doc)) as vscode.TextDocument[];
	}

	public get onDidChangeMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidChangeMarkdownDocumentEmitter.event;
	}

	private ensureWatcher(): void {
		if (this._watcher) {
			return;
		}

		this._watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

		this._watcher.onDidChange(async resource => {
			const document = await vscode.workspace.openTextDocument(resource);
			if (isMarkdownFile(document)) {
				this._onDidChangeMarkdownDocumentEmitter.fire(document);
			}
		}, this, this._disposables);
	}
}


export default class MarkdownWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	private _symbolCache = new Map<string, Thenable<vscode.SymbolInformation[]>>();
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

			this._workspaceMarkdownDocumentProvider.onDidChangeMarkdownDocument(this.onDidChange, this, this._disposables);
		}

		const allSymbolsSets = await Promise.all(Array.from(this._symbolCache.values()));
		const allSymbols: vscode.SymbolInformation[] = Array.prototype.concat.apply([], allSymbolsSets);
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}

	public async populateSymbolCache(): Promise<void> {
		const markDownDocumentUris = await this._workspaceMarkdownDocumentProvider.getAllMarkdownDocuments();
		for (const document of markDownDocumentUris) {
			this._symbolCache.set(document.fileName, this.getSymbols(document));
		}
	}

	public dispose(): void {
		disposeAll(this._disposables);
	}

	private getSymbols(document: vscode.TextDocument): Promise<vscode.SymbolInformation[]> {
		return this._symbolProvider.provideDocumentSymbols(document);
	}

	private onDidChange(document: vscode.TextDocument) {
		this._symbolCache.set(document.fileName, this.getSymbols(document));
	}
}