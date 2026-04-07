import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export async function findParentFolder(relativeFilePath: string): Promise<string | null> {
	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (!workspaceFolders) {
		console.error('No workspace folders found');
		return null;
	}

	for (const folder of workspaceFolders) {
		const fullPath = path.join(folder.uri.fsPath, relativeFilePath);

		try {
			const stats = await fs.promises.stat(fullPath);
			if (stats.isFile()) {
				return folder.uri.fsPath;
			}
		} catch (err) {
			// File does not exist in this folder, continue to next
		}
	}

	return null;
}