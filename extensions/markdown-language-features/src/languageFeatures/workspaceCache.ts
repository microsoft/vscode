/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { Lazy, lazy } from '../util/lazy';
import { ResourceMap } from '../util/resourceMap';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';

/**
 * Cache of information for markdown files in the workspace.
 */
export class MdWorkspaceCache<T> extends Disposable {

	private readonly _cache = new ResourceMap<Lazy<Promise<T>>>();
	private _init?: Promise<void>;

	public constructor(
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly getValue: (document: SkinnyTextDocument) => Promise<T>,
	) {
		super();
	}

	public async entries(): Promise<Array<[vscode.Uri, T]>> {
		await this.ensureInit();
		return Promise.all(Array.from(this._cache.entries(), async ([key, entry]) => {
			return [key, await entry.value];
		}));
	}

	public async values(): Promise<Array<T>> {
		await this.ensureInit();
		return Promise.all(Array.from(this._cache.values(), x => x.value));
	}

	private async ensureInit(): Promise<void> {
		if (!this._init) {
			this._init = this.populateCache();

			this._register(this.workspaceContents.onDidChangeMarkdownDocument(this.onDidChangeDocument, this));
			this._register(this.workspaceContents.onDidCreateMarkdownDocument(this.onDidChangeDocument, this));
			this._register(this.workspaceContents.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this));
		}
		await this._init;
	}

	private async populateCache(): Promise<void> {
		const markdownDocumentUris = await this.workspaceContents.getAllMarkdownDocuments();
		for (const document of markdownDocumentUris) {
			this.update(document);
		}
	}

	private update(document: SkinnyTextDocument): void {
		this._cache.set(document.uri, lazy(() => this.getValue(document)));
	}

	private onDidChangeDocument(document: SkinnyTextDocument) {
		this.update(document);
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._cache.delete(resource);
	}
}
