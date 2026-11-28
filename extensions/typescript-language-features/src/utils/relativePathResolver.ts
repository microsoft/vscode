/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';

export class RelativeWorkspacePathResolver {
	public static asAbsoluteWorkspacePath(relativePath: string): string | undefined {
		// Root-prefix resolution only applies in multi-root workspaces where paths
		// need to be disambiguated across multiple workspace folders. In single-root
		// workspaces, settings are already relative to the single workspace root.
		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 1) {
			return undefined;
		}

		for (const root of vscode.workspace.workspaceFolders) {
			const rootPrefixes = [`./${root.name}/`, `${root.name}/`, `.\\${root.name}\\`, `${root.name}\\`];
			for (const rootPrefix of rootPrefixes) {
				if (relativePath.startsWith(rootPrefix)) {
					return path.join(root.uri.fsPath, relativePath.slice(rootPrefix.length));
				}
			}
		}

		return undefined;
	}
}
