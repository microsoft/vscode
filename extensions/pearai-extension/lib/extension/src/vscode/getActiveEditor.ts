import * as vscode from "vscode";

export function getActiveEditor() {
	return vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
}
