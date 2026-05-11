import * as vscode from 'vscode';

function areUrisInSameFolder(uri1: vscode.Uri, uri2: vscode.Uri): boolean {
	const folder1 = vscode.workspace.getWorkspaceFolder(uri1);
	const folder2 = vscode.workspace.getWorkspaceFolder(uri2);

	if (!folder1 || !folder2) {
		return false;
	}

	return folder1.uri.toString() === folder2.uri.toString();
}