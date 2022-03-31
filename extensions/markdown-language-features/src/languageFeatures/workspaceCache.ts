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

	private readonly _cache = new Map<string, Lazy<Promise<T>>>();
	private _hasPopulatedCache = false;

	public constructor(
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly getValue: (document: SkinnyTextDocument) => Promise<T>,
	) {
		super();
	}

	public async getAll(): Promise<T[]> {
		if (!this._hasPopulatedCache) {
			await this.populateCache();
			this._hasPopulatedCache = true;

			this.workspaceContents.onDidChangeMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this.workspaceContents.onDidCreateMarkdownDocument(this.onDidChangeDocument, this, this._disposables);
			this.workspaceContents.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this, this._disposables);
		}

		return Promise.all(Array.from(this._cache.values(), x => x.value));
	}

	private async populateCache(): Promise<void> {
		const markdownDocumentUris = await this.workspaceContents.getAllMarkdownDocuments();
		for (const document of markdownDocumentUris) {
			this.update(document);
		}
	}

	private key(resource: vscode.Uri): string {
		return resource.toString();
	}

	private update(document: SkinnyTextDocument): void {
		this._cache.set(this.key(document.uri), lazy(() => this.getValue(document)));
	}

	private onDidChangeDocument(document: SkinnyTextDocument) {
		this.update(document);
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._cache.delete(this.key(resource));
	}
}
