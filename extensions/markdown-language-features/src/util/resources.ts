/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';


export function toResoruceUri(webviewResourceRoot: string, uri: vscode.Uri): vscode.Uri {
	const rootUri = vscode.Uri.parse(webviewResourceRoot);
	return rootUri.with({
		path: rootUri.path + uri.path,
		query: uri.query,
		fragment: uri.fragment,
	});
}
