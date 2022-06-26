/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITextDocument } from '../types/textDocument';
import { IMdWorkspace } from '../workspace';
import { Disposable } from './dispose';
import { Lazy, lazy } from './lazy';
import { ResourceMap } from './resourceMap';

class LazyResourceMap<T> {
	private readonly _map = new ResourceMap<Lazy<Promise<T>>>();

	public has(resource: vscode.Uri): boolean {
		return this._map.has(resource);
	}

	public get(resource: vscode.Uri): Promise<T> | undefined {
		return this._map.get(resource)?.value;
	}

	public set(resource: vscode.Uri, value: Lazy<Promise<T>>) {
		this._map.set(resource, value);
	}

	public delete(resource: vscode.Uri) {
		this._map.delete(resource);
	}

	public entries(): Promise<Array<[vscode.Uri, T]>> {
		return Promise.all(Array.from(this._map.entries(), async ([key, entry]) => {
			return [key, await entry.value];
		}));
	}
}

/**
 * Cache of information per-document in the workspace.
 *
 * The values are computed lazily and invalidated when the document changes.
 */
export class MdDocumentInfoCache<T> extends Disposable {

	private readonly _cache = new LazyResourceMap<T>();
	private readonly _loadingDocuments = new ResourceMap<Promise<ITextDocument | undefined>>();

	public constructor(
		private readonly workspace: IMdWorkspace,
		private readonly getValue: (document: ITextDocument) => Promise<T>,
	) {
		super();

		this._register(this.workspace.onDidChangeMarkdownDocument(doc => this.invalidate(doc)));
		this._register(this.workspace.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this));
	}

	public async get(resource: vscode.Uri): Promise<T | undefined> {
		let existing = this._cache.get(resource);
		if (existing) {
			return existing;
		}

		const doc = await this.loadDocument(resource);
		if (!doc) {
			return undefined;
		}

		// Check if we have invalidated
		existing = this._cache.get(resource);
		if (existing) {
			return existing;
		}

		return this.resetEntry(doc)?.value;
	}

	public async getForDocument(document: ITextDocument): Promise<T> {
		const existing = this._cache.get(document.uri);
		if (existing) {
			return existing;
		}
		return this.resetEntry(document).value;
	}

	private loadDocument(resource: vscode.Uri): Promise<ITextDocument | undefined> {
		const existing = this._loadingDocuments.get(resource);
		if (existing) {
			return existing;
		}

		const p = this.workspace.getOrLoadMarkdownDocument(resource);
		this._loadingDocuments.set(resource, p);
		p.finally(() => {
			this._loadingDocuments.delete(resource);
		});
		return p;
	}

	private resetEntry(document: ITextDocument): Lazy<Promise<T>> {
		const value = lazy(() => this.getValue(document));
		this._cache.set(document.uri, value);
		return value;
	}

	private invalidate(document: ITextDocument): void {
		if (this._cache.has(document.uri)) {
			this.resetEntry(document);
		}
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._cache.delete(resource);
	}
}

/**
 * Cache of information across all markdown files in the workspace.
 *
 * Unlike {@link MdDocumentInfoCache}, the entries here are computed eagerly for every file in the workspace.
 * However the computation of the values is still lazy.
 */
export class MdWorkspaceInfoCache<T> extends Disposable {

	private readonly _cache = new LazyResourceMap<T>();
	private _init?: Promise<void>;

	public constructor(
		private readonly workspace: IMdWorkspace,
		private readonly getValue: (document: ITextDocument) => Promise<T>,
	) {
		super();
	}

	public async entries(): Promise<Array<[vscode.Uri, T]>> {
		await this.ensureInit();
		return this._cache.entries();
	}

	public async values(): Promise<Array<T>> {
		await this.ensureInit();
		return Array.from(await this._cache.entries(), x => x[1]);
	}

	private async ensureInit(): Promise<void> {
		if (!this._init) {
			this._init = this.populateCache();

			this._register(this.workspace.onDidChangeMarkdownDocument(this.onDidChangeDocument, this));
			this._register(this.workspace.onDidCreateMarkdownDocument(this.onDidChangeDocument, this));
			this._register(this.workspace.onDidDeleteMarkdownDocument(this.onDidDeleteDocument, this));
		}
		await this._init;
	}

	private async populateCache(): Promise<void> {
		const markdownDocumentUris = await this.workspace.getAllMarkdownDocuments();
		for (const document of markdownDocumentUris) {
			this.update(document);
		}
	}

	private update(document: ITextDocument): void {
		this._cache.set(document.uri, lazy(() => this.getValue(document)));
	}

	private onDidChangeDocument(document: ITextDocument) {
		this.update(document);
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._cache.delete(resource);
	}
}
