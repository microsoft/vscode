/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ITextDocument } from '../types/textDocument';
import { ResourceMap } from '../util/resourceMap';
import { IMdWorkspace } from '../workspace';


export class InMemoryMdWorkspace implements IMdWorkspace {
	private readonly _documents = new ResourceMap<ITextDocument>(uri => uri.fsPath);

	constructor(documents: ITextDocument[]) {
		for (const doc of documents) {
			this._documents.set(doc.uri, doc);
		}
	}

	public async getAllMarkdownDocuments() {
		return Array.from(this._documents.values());
	}

	public async getOrLoadMarkdownDocument(resource: vscode.Uri): Promise<ITextDocument | undefined> {
		return this._documents.get(resource);
	}

	public hasMarkdownDocument(resolvedHrefPath: vscode.Uri): boolean {
		return this._documents.has(resolvedHrefPath);
	}

	public async pathExists(resource: vscode.Uri): Promise<boolean> {
		return this._documents.has(resource);
	}

	private readonly _onDidChangeMarkdownDocumentEmitter = new vscode.EventEmitter<ITextDocument>();
	public onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocumentEmitter.event;

	private readonly _onDidCreateMarkdownDocumentEmitter = new vscode.EventEmitter<ITextDocument>();
	public onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocumentEmitter.event;

	private readonly _onDidDeleteMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();
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

	public deleteDocument(resource: vscode.Uri) {
		this._documents.delete(resource);
		this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
	}
}
