/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Schemes } from './schemes';
import { Utils } from 'vscode-uri';

export function getDocumentDir(uri: vscode.Uri): vscode.Uri | undefined {
	const docUri = getParentDocumentUri(uri);
	if (docUri.scheme === Schemes.untitled) {
		return vscode.workspace.workspaceFolders?.[0]?.uri;
	}
	return Utils.dirname(docUri);
}

export function getParentDocumentUri(uri: vscode.Uri): vscode.Uri {
	if (uri.scheme === Schemes.notebookCell) {
		for (const notebook of vscode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.document.uri.toString() === uri.toString()) {
					return notebook.uri;
				}
			}
		}
	}

	return uri;
}
