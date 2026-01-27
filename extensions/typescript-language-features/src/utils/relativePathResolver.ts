/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';

export class RelativeWorkspacePathResolver {
	public static asAbsoluteWorkspacePath(relativePath: string): string | undefined {
		// Handle ${workspaceFolder} variable
		const workspaceFolderVar = '${workspaceFolder}';
		if (relativePath.startsWith(workspaceFolderVar) && vscode.workspace.workspaceFolders?.[0]) {
			const remainingPath = relativePath.substring(workspaceFolderVar.length);
			return path.join(
				vscode.workspace.workspaceFolders[0].uri.fsPath,
				// Remove leading slash/backslash if present
				remainingPath.replace(/^[/\\]/, '')
			);
		}

		// Handle the original path formats
		for (const root of vscode.workspace.workspaceFolders || []) {
			const rootPrefixes = [`./${root.name}/`, `${root.name}/`, `.\\${root.name}\\`, `${root.name}\\`];
			for (const rootPrefix of rootPrefixes) {
				if (relativePath.startsWith(rootPrefix)) {
					return path.join(root.uri.fsPath, relativePath.replace(rootPrefix, ''));
				}
			}
		}

		return undefined;
	}
}
