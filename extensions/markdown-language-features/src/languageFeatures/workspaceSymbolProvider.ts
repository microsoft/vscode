/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { Lazy, lazy } from '../util/lazy';
import { SkinnyTextDocument, MdWorkspaceContents } from '../workspaceContents';
import { MdDocumentSymbolProvider } from './documentSymbolProvider';


export class MdWorkspaceSymbolProvider extends Disposable implements vscode.WorkspaceSymbolProvider {

	private readonly _symbolCache = new Map<string, Lazy<Thenable<vscode.SymbolInformation[]>>>();
	private _symbolCachePopulated: boolean = false;

	public constructor(
		private _symbolProvider: MdDocumentSymbolProvider,
		private _workspaceMarkdownDocumentProvider: MdWorkspaceContents,
	) {
		super();
	}

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		if (!this._symbolCachePopulated) {
			await this.populateSymbolCache();
			this._symbolCachePopulated = true;

			this._workspaceMarkdownDocumentProvider.onDidChangeMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this._workspaceMarkdownDocumentProvider.onDidCreateMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this._workspaceMarkdownDocumentProvider.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this, this._disposables);
		}

		const allSymbolsSets = await Promise.all(Array.from(this._symbolCache.values(), x => x.value));
		const allSymbols = allSymbolsSets.flat();
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}

	public async populateSymbolCache(): Promise<void> {
		const markdownDocumentUris = await this._workspaceMarkdownDocumentProvider.getAllMarkdownDocuments();
		for (const document of markdownDocumentUris) {
			this._symbolCache.set(document.uri.toString(), this.getSymbols(document));
		}
	}

	private getSymbols(document: SkinnyTextDocument): Lazy<Thenable<vscode.SymbolInformation[]>> {
		return lazy(() => {
			return this._symbolProvider.provideDocumentSymbolInformation(document);
		});
	}

	private onDidChangeDocument(document: SkinnyTextDocument) {
		this._symbolCache.set(document.uri.toString(), this.getSymbols(document));
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._symbolCache.delete(resource.toString());
	}
}
