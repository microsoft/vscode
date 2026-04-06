/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';

export class RelativeWorkspacePathResolver {
	public static asAbsoluteWorkspacePath(relativePath: string): string | undefined {
		for (const root of vscode.workspace.workspaceFolders || []) {
			const result = RelativeWorkspacePathResolver.resolveForFolder(relativePath, root.name, root.uri.fsPath);
			if (result !== undefined) {
				return result;
			}
		}

		return undefined;
	}

	/**
	 * Resolve a relative path for a given workspace folder.
	 * Only strips explicit relative prefixes (e.g. `./folderName/`) to avoid
	 * ambiguity when the path happens to start with the same name as the folder.
	 */
	public static resolveForFolder(relativePath: string, folderName: string, folderFsPath: string): string | undefined {
		const rootPrefixes = [`./${folderName}/`, `.\\${folderName}\\`];
		for (const rootPrefix of rootPrefixes) {
			if (relativePath.startsWith(rootPrefix)) {
				return path.join(folderFsPath, relativePath.replace(rootPrefix, ''));
			}
		}
		return undefined;
	}
}
