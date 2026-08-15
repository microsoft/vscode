import * as path from 'path';
import * as vscode from 'vscode';

export function getRelativeFilePath(uri: vscode.Uri): string | undefined {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
	if (!workspaceFolder) {
		return undefined;
	}

	const workspaceRoot = workspaceFolder.uri.fsPath;
	const absolutePath = uri.fsPath;
	return path.relative(workspaceRoot, absolutePath);
}