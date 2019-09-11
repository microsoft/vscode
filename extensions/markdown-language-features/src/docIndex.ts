/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './util/dispose';


export class DocumentIndex extends Disposable {
	private readonly _uriMap = new Map();

	constructor() {
		super();

		for (let doc of vscode.workspace.textDocuments) {
			this._registerDoc(doc);
		}

		this._register(
			vscode.workspace.onDidOpenTextDocument((doc) => {
				this._registerDoc(doc);
			})
		);
		this._register(
			vscode.workspace.onDidCloseTextDocument((doc) => {
				this._unregisterDoc(doc.uri);
			})
		);
	}

	getByUri(uri: vscode.Uri): vscode.TextDocument | undefined {
		return this._uriMap.get(uri.toString());
	}

	private _registerDoc(doc: vscode.TextDocument) {
		const uri = doc.uri.toString();
		if (this._uriMap.has(uri)) {
			throw new Error(`The document ${uri} is already registered.`);
		}
		this._uriMap.set(uri, doc);
	}

	private _unregisterDoc(uri: vscode.Uri) {
		if (!this._uriMap.has(uri.toString())) {
			throw new Error(`The document ${uri.toString()} is not registered.`);
		}
		this._uriMap.delete(uri.toString());
	}
}
