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

	private readonly _cache: MdWorkspaceCache<Promise<vscode.SymbolInformation[]>>;

	public constructor(
		symbolProvider: MdDocumentSymbolProvider,
		workspaceContents: MdWorkspaceContents,
	) {
		super();

		this._cache = this._register(new MdWorkspaceCache(workspaceContents, doc => symbolProvider.provideDocumentSymbolInformation(doc)));
	}

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		const allSymbolSets = await this._cache.getAll();
		const allSymbols = (await Promise.all(allSymbolSets)).flat();
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}
}

/**
 * Cache of information for markdown files in the workspace.
 */
class MdWorkspaceCache<T> extends Disposable {

	private readonly _cache = new Map<string, Lazy<T>>();
	private _hasPopulatedCache = false;

	public constructor(
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly getValue: (document: SkinnyTextDocument) => T,
	) {
		super();
	}

	public async getAll(): Promise<T[]> {
		if (!this._hasPopulatedCache) {
			await this.populateSymbolCache();
			this._hasPopulatedCache = true;

			this.workspaceContents.onDidChangeMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this.workspaceContents.onDidCreateMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this.workspaceContents.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this, this._disposables);
		}

		return Array.from(this._cache.values(), x => x.value);
	}

	private async populateSymbolCache(): Promise<void> {
		const markdownDocumentUris = await this.workspaceContents.getAllMarkdownDocuments();
		for (const document of markdownDocumentUris) {
			this._cache.set(document.uri.toString(), this.update(document));
		}
	}

	private update(document: SkinnyTextDocument): Lazy<T> {
		return lazy(() => this.getValue(document));
	}

	private onDidChangeDocument(document: SkinnyTextDocument) {
		this._cache.set(document.uri.toString(), this.update(document));
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._cache.delete(resource.toString());
	}
}
