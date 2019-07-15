/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as vscode from 'vscode';

export interface WebviewInitData {
	readonly webviewResourceRoot: string;
	readonly webviewCspSource: string;
}

export function toWebviewResource(
	initData: WebviewInitData,
	uuid: string,
	resource: vscode.Uri
): vscode.Uri {
	const uri = initData.webviewResourceRoot
		.replace('{{resource}}', resource.toString().replace(/^\S+?:/, ''))
		.replace('{{uuid}}', uuid);

	return URI.parse(uri);
}
