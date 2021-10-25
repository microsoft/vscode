/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const exists = async (resource: vscode.Uri): Promise<boolean> => {
	try {
		const stat = await vscode.workspace.fs.stat(resource);
		// stat.type is an enum flag
		return !!(stat.type & vscode.FileType.File);
	} catch {
		return false;
	}
};
