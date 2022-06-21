/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ResourceMap } from '../util/resourceMap';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';


export class InMemoryWorkspaceMarkdownDocuments implements MdWorkspaceContents {
	private readonly _documents = new ResourceMap<SkinnyTextDocument>(uri => uri.fsPath);

	constructor(documents: SkinnyTextDocument[]) {
		for (const doc of documents) {
			this._documents.set(doc.uri, doc);
		}
	}

	public async getAllMarkdownDocuments() {
		return Array.from(this._documents.values());
	}

	public async getOrLoadMarkdownDocument(resource: vscode.Uri): Promise<SkinnyTextDocument | undefined> {
		return this._documents.get(resource);
	}

	public hasMarkdownDocument(resolvedHrefPath: vscode.Uri): boolean {
		return this._documents.has(resolvedHrefPath);
	}

	public async pathExists(resource: vscode.Uri): Promise<boolean> {
		return this._documents.has(resource);
	}

	private readonly _onDidChangeMarkdownDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	public onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocumentEmitter.event;

	private readonly _onDidCreateMarkdownDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	public onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocumentEmitter.event;

	private readonly _onDidDeleteMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();
	public onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocumentEmitter.event;

	public updateDocument(document: SkinnyTextDocument) {
		this._documents.set(document.uri, document);
		this._onDidChangeMarkdownDocumentEmitter.fire(document);
	}

	public createDocument(document: SkinnyTextDocument) {
		assert.ok(!this._documents.has(document.uri));

		this._documents.set(document.uri, document);
		this._onDidCreateMarkdownDocumentEmitter.fire(document);
	}

	public deleteDocument(resource: vscode.Uri) {
		this._documents.delete(resource);
		this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
	}
}
