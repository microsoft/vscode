/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';

export interface WebviewResourceProvider {
	asWebviewUri(resource: vscode.Uri): vscode.Uri;

	readonly cspSource: string;
}

export function getMarkdownLocalResourceRoots(
	resource: vscode.Uri,
	baseRoots: readonly vscode.Uri[],
	options: {
		readonly includeWorkspaceResources?: boolean;
		readonly workspaceContext?: Pick<typeof vscode.workspace, 'getWorkspaceFolder' | 'workspaceFolders'>;
	} = {},
): vscode.Uri[] {
	const roots = [...baseRoots];
	if (options.includeWorkspaceResources === false) {
		return roots;
	}

	const workspaceContext = options.workspaceContext ?? vscode.workspace;
	if (workspaceContext.getWorkspaceFolder(resource)) {
		roots.push(...workspaceContext.workspaceFolders?.map(folder => folder.uri) ?? []);
	} else {
		roots.push(Utils.dirname(resource));
	}

	return roots;
}

export function areUrisEqual(uri1: vscode.Uri, uri2: vscode.Uri): boolean {
	if (uri1.scheme !== uri2.scheme) {
		return false;
	}

	if (uri1.authority !== uri2.authority) {
		return false;
	}

	if (uri1.scheme === 'file') {
		if (process.platform === 'win32' || process.platform === 'darwin') {
			return uri1.fsPath.toLowerCase() === uri2.fsPath.toLowerCase();
		}

		return uri1.fsPath === uri2.fsPath;
	}

	return uri1.toString() === uri2.toString();
}
