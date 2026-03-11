/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface WebviewResourceProvider {
	asWebviewUri(resource: vscode.Uri): vscode.Uri;

	readonly cspSource: string;
}

export function areUrisEqual(uri1: vscode.Uri, uri2: vscode.Uri): boolean {
	if (uri1.scheme === 'file' && uri2.scheme === 'file') {
		return uri1.fsPath.toLowerCase() === uri2.fsPath.toLowerCase();
	}

	return uri1.fsPath === uri2.fsPath;
}
