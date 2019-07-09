/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as vscode from 'vscode';

export interface WebviewInitData {
	readonly webviewResourceRoot: string;
	readonly webviewCspRule: string;
}

export function toWebviewResource(
	initData: WebviewInitData,
	resource: vscode.Uri
): vscode.Uri {
	const rootUri = URI.parse(initData.webviewResourceRoot);
	return rootUri.with({
		path: rootUri.path + resource.path,
		query: resource.query,
		fragment: resource.fragment,
	});
}
