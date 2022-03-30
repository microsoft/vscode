/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { MdWorkspaceContents } from '../workspaceContents';


export class InMemoryWorkspaceMarkdownDocuments implements MdWorkspaceContents {
	private readonly _documents = new Map<string, vscode.TextDocument>();

	constructor(documents: vscode.TextDocument[]) {
		for (const doc of documents) {
			this._documents.set(doc.fileName, doc);
		}
	}

	async getAllMarkdownDocuments() {
		return Array.from(this._documents.values());
	}

	private readonly _onDidChangeMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>();
	public onDidChangeMarkdownDocument = this._onDidChangeMarkdownDocumentEmitter.event;

	private readonly _onDidCreateMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>();
	public onDidCreateMarkdownDocument = this._onDidCreateMarkdownDocumentEmitter.event;

	private readonly _onDidDeleteMarkdownDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();
	public onDidDeleteMarkdownDocument = this._onDidDeleteMarkdownDocumentEmitter.event;

	public updateDocument(document: vscode.TextDocument) {
		this._documents.set(document.fileName, document);
		this._onDidChangeMarkdownDocumentEmitter.fire(document);
	}

	public createDocument(document: vscode.TextDocument) {
		assert.ok(!this._documents.has(document.uri.fsPath));

		this._documents.set(document.uri.fsPath, document);
		this._onDidCreateMarkdownDocumentEmitter.fire(document);
	}

	public deleteDocument(resource: vscode.Uri) {
		this._documents.delete(resource.fsPath);
		this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
	}
}
