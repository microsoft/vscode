/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const rootUri = vscode.Uri.parse(vscode.env.webviewResourceRoot);

export function toResoruceUri(uri: vscode.Uri): vscode.Uri {
	return rootUri.with({
		path: rootUri.path + uri.path,
		query: uri.query,
		fragment: uri.fragment,
	});
}
