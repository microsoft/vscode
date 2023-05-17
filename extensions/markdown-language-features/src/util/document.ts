/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Schemes } from './schemes';
import { Utils } from 'vscode-uri';

export function getDocumentDir(document: vscode.TextDocument): vscode.Uri | undefined {
	const docUri = getParentDocumentUri(document);
	if (docUri.scheme === Schemes.untitled) {
		return vscode.workspace.workspaceFolders?.[0]?.uri;
	}
	return Utils.dirname(docUri);
}

export function getParentDocumentUri(document: vscode.TextDocument): vscode.Uri {
	if (document.uri.scheme === Schemes.notebookCell) {
		for (const notebook of vscode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.document === document) {
					return notebook.uri;
				}
			}
		}
	}

	return document.uri;
}
