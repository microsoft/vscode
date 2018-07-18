/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { disposeAll } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { Lazy, lazy } from '../util/lazy';
import MDDocumentSymbolProvider from './documentSymbolProvider';
import { SkinnyTextDocument } from '../tableOfContentsProvider';

export interface WorkspaceMarkdownDocumentProvider {
	getAllMarkdownDocuments(): Thenable<Iterable<SkinnyTextDocument>>;

	readonly onDidChangeMarkdownDocument: vscode.Event<SkinnyTextDocument>;
	readonly onDidCreateMarkdownDocument: vscode.Event<SkinnyTextDocument>;
	readonly onDidDeleteMarkdownDocument: vscode.Event<vscode.Uri>;
}

class VSCodeWorkspaceMarkdownDocumentProvider implements WorkspaceMarkdownDocumentProvider {

	private readonly _onDidChangeMarkdownDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	private readonly _onDidCreateMarkdownDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	private readonly _onDidDeleteMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();

	private _watcher: vscode.FileSystemWatcher | undefined;
	private _disposables: vscode.Disposable[] = [];

	public dispose() {
		this._onDidChangeMarkdownDocumentEmitter.dispose();
		this._onDidDeleteMarkdownDocumentEmitter.dispose();

		if (this._watcher) {
			this._watcher.dispose();
		}

		disposeAll(this._disposables);
	}

	async getAllMarkdownDocuments() {
		const resources = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
		const docs = await Promise.all(resources.map(doc => this.getMarkdownDocument(doc)));
		return docs.filter(doc => !!doc) as SkinnyTextDocument[];
	}

	public get onDidChangeMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidChangeMarkdownDocumentEmitter.event;
	}

	public get onDidCreateMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidCreateMarkdownDocumentEmitter.event;
	}

	public get onDidDeleteMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidDeleteMarkdownDocumentEmitter.event;
	}

	private ensureWatcher(): void {
		if (this._watcher) {
			return;
		}

		this._watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

		this._watcher.onDidChange(async resource => {
			const document = await this.getMarkdownDocument(resource);
			if (document) {
				this._onDidChangeMarkdownDocumentEmitter.fire(document);
			}
		}, null, this._disposables);

		this._watcher.onDidCreate(async resource => {
			const document = await this.getMarkdownDocument(resource);
			if (document) {
				this._onDidCreateMarkdownDocumentEmitter.fire(document);
			}
		}, null, this._disposables);

		this._watcher.onDidDelete(async resource => {
			this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
		}, null, this._disposables);

		vscode.workspace.onDidChangeTextDocument(e => {
			if (isMarkdownFile(e.document)) {
				this._onDidChangeMarkdownDocumentEmitter.fire(e.document);
			}
		}, null, this._disposables);
	}

	private async getMarkdownDocument(resource: vscode.Uri): Promise<SkinnyTextDocument | undefined> {
		const doc = await vscode.workspace.openTextDocument(resource);
		return doc && isMarkdownFile(doc) ? doc : undefined;
	}
}


export default class MarkdownWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	private _symbolCache = new Map<string, Lazy<Thenable<vscode.SymbolInformation[]>>>();
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

			this._workspaceMarkdownDocumentProvider.onDidChangeMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this._workspaceMarkdownDocumentProvider.onDidCreateMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this._workspaceMarkdownDocumentProvider.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this, this._disposables);
		}

		const allSymbolsSets = await Promise.all(Array.from(this._symbolCache.values()).map(x => x.value));
		const allSymbols: vscode.SymbolInformation[] = Array.prototype.concat.apply([], allSymbolsSets);
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}

	public async populateSymbolCache(): Promise<void> {
		const markdownDocumentUris = await this._workspaceMarkdownDocumentProvider.getAllMarkdownDocuments();
		for (const document of markdownDocumentUris) {
			this._symbolCache.set(document.uri.fsPath, this.getSymbols(document));
		}
	}

	public dispose(): void {
		disposeAll(this._disposables);
	}

	private getSymbols(document: SkinnyTextDocument): Lazy<Thenable<vscode.SymbolInformation[]>> {
		return lazy(async () => {
			return this._symbolProvider.provideDocumentSymbolInformation(document);
		});
	}

	private onDidChangeDocument(document: SkinnyTextDocument) {
		this._symbolCache.set(document.uri.fsPath, this.getSymbols(document));
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._symbolCache.delete(resource.fsPath);
	}
}
