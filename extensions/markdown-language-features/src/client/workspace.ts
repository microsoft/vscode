/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITextDocument } from '../types/textDocument';
import { Disposable } from '../util/dispose';
import { isMarkdownFile, looksLikeMarkdownPath } from '../util/file';
import { InMemoryDocument } from './inMemoryDocument';
import { ResourceMap } from '../util/resourceMap';

/**
 * Provides set of markdown files known to VS Code.
 *
 * This includes both opened text documents and markdown files in the workspace.
 */
export class VsCodeMdWorkspace extends Disposable {

	private _watcher: vscode.FileSystemWatcher | undefined;

	private readonly _documentCache = new ResourceMap<ITextDocument>();

	private readonly _utf8Decoder = new TextDecoder('utf-8');

	constructor() {
		super();

		this._watcher = this._register(vscode.workspace.createFileSystemWatcher('**/*.md'));

		this._register(this._watcher.onDidChange(async resource => {
			this._documentCache.delete(resource);
		}));

		this._register(this._watcher.onDidDelete(resource => {
			this._documentCache.delete(resource);
		}));

		this._register(vscode.workspace.onDidOpenTextDocument(e => {
			this._documentCache.delete(e.uri);
		}));

		this._register(vscode.workspace.onDidCloseTextDocument(e => {
			this._documentCache.delete(e.uri);
		}));
	}

	private _isRelevantMarkdownDocument(doc: vscode.TextDocument) {
		return isMarkdownFile(doc) && doc.uri.scheme !== 'vscode-bulkeditpreview';
	}

	public async getOrLoadMarkdownDocument(resource: vscode.Uri): Promise<ITextDocument | undefined> {
		const existing = this._documentCache.get(resource);
		if (existing) {
			return existing;
		}

		const matchingDocument = vscode.workspace.textDocuments.find((doc) => this._isRelevantMarkdownDocument(doc) && doc.uri.toString() === resource.toString());
		if (matchingDocument) {
			this._documentCache.set(resource, matchingDocument);
			return matchingDocument;
		}

		if (!looksLikeMarkdownPath(resource)) {
			return undefined;
		}

		try {
			const bytes = await vscode.workspace.fs.readFile(resource);

			// We assume that markdown is in UTF-8
			const text = this._utf8Decoder.decode(bytes);
			const doc = new InMemoryDocument(resource, text, 0);
			this._documentCache.set(resource, doc);
			return doc;
		} catch {
			return undefined;
		}
	}
}
