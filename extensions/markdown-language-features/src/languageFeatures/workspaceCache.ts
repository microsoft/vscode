/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { Lazy, lazy } from '../util/lazy';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';

/**
 * Cache of information for markdown files in the workspace.
 */
export class MdWorkspaceCache<T> extends Disposable {

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
