/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';


export class InMemoryWorkspaceMarkdownDocuments implements MdWorkspaceContents {
	private readonly _documents = new Map<string, SkinnyTextDocument>();

	constructor(documents: SkinnyTextDocument[]) {
		for (const doc of documents) {
			this._documents.set(this.getKey(doc.uri), doc);
		}
	}

	public async getAllMarkdownDocuments() {
		return Array.from(this._documents.values());
	}

	public async getMarkdownDocument(resource: vscode.Uri): Promise<SkinnyTextDocument | undefined> {
		return this._documents.get(this.getKey(resource));
	}

	private readonly _onDidChangeMarkdownDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	public onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocumentEmitter.event;

	private readonly _onDidCreateMarkdownDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	public onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocumentEmitter.event;

	private readonly _onDidDeleteMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();
	public onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocumentEmitter.event;

	public updateDocument(document: SkinnyTextDocument) {
		this._documents.set(this.getKey(document.uri), document);
		this._onDidChangeMarkdownDocumentEmitter.fire(document);
	}

	public createDocument(document: SkinnyTextDocument) {
		assert.ok(!this._documents.has(this.getKey(document.uri)));

		this._documents.set(this.getKey(document.uri), document);
		this._onDidCreateMarkdownDocumentEmitter.fire(document);
	}

	public deleteDocument(resource: vscode.Uri) {
		this._documents.delete(this.getKey(resource));
		this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
	}

	private getKey(resource: vscode.Uri): string {
		return resource.fsPath;
	}
}
