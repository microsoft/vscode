/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vscode-languageserver';
import * as path from 'path';
import { ITextDocument } from '../types/textDocument';
import { IUri } from '../types/uri';
import { Disposable } from '../util/dispose';
import { ResourceMap } from '../util/resourceMap';
import { IMdWorkspace } from '../workspace';


export class InMemoryMdWorkspace extends Disposable implements IMdWorkspace {
	private readonly _documents = new ResourceMap<ITextDocument>(uri => uri.fsPath);

	constructor(documents: ITextDocument[]) {
		super();
		for (const doc of documents) {
			this._documents.set(doc.uri, doc);
		}
	}

	public values() {
		return Array.from(this._documents.values());
	}

	public async getAllMarkdownDocuments() {
		return this.values();
	}

	public async getOrLoadMarkdownDocument(resource: IUri): Promise<ITextDocument | undefined> {
		return this._documents.get(resource);
	}

	public hasMarkdownDocument(resolvedHrefPath: IUri): boolean {
		return this._documents.has(resolvedHrefPath);
	}

	public async pathExists(resource: IUri): Promise<boolean> {
		return this._documents.has(resource);
	}

	public async readDirectory(resource: IUri): Promise<[string, { isDir: boolean }][]> {
		const files = new Map<string, { isDir: boolean }>();
		const pathPrefix = resource.fsPath + (resource.fsPath.endsWith('/') || resource.fsPath.endsWith('\\') ? '' : path.sep);
		for (const doc of this._documents.values()) {
			const path = doc.uri.fsPath;
			if (path.startsWith(pathPrefix)) {
				const parts = path.slice(pathPrefix.length).split(/\/|\\/g);
				files.set(parts[0], parts.length > 1 ? { isDir: true } : { isDir: false });
			}
		}
		return Array.from(files.entries());
	}

	private readonly _onDidChangeMarkdownDocumentEmitter = this._register(new Emitter<ITextDocument>());
	public onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocumentEmitter.event;

	private readonly _onDidCreateMarkdownDocumentEmitter = this._register(new Emitter<ITextDocument>());
	public onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocumentEmitter.event;

	private readonly _onDidDeleteMarkdownDocumentEmitter = this._register(new Emitter<IUri>());
	public onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocumentEmitter.event;

	public updateDocument(document: ITextDocument) {
		this._documents.set(document.uri, document);
		this._onDidChangeMarkdownDocumentEmitter.fire(document);
	}

	public createDocument(document: ITextDocument) {
		assert.ok(!this._documents.has(document.uri));

		this._documents.set(document.uri, document);
		this._onDidCreateMarkdownDocumentEmitter.fire(document);
	}

	public deleteDocument(resource: IUri) {
		this._documents.delete(resource);
		this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
	}
}
