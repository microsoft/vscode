import * as vscode from "vscode";

export type DiffData = {
	readonly filename: string;
	readonly range: vscode.Range;
	readonly selectedText: string;
	readonly language: string | undefined;
	readonly editor: vscode.TextEditor;
};
