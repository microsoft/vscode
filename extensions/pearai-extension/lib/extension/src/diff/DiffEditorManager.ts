import * as vscode from "vscode";
import { DiffEditor } from "./DiffEditor";

export class DiffEditorManager {
	private extensionUri: vscode.Uri;

	constructor({ extensionUri }: { extensionUri: vscode.Uri }) {
		this.extensionUri = extensionUri;
	}

	createDiffEditor({
		title,
		editorColumn,
		conversationId,
	}: {
		title: string;
		editorColumn: vscode.ViewColumn;
		conversationId: string;
	}) {
		return new DiffEditor({
			title,
			editorColumn,
			extensionUri: this.extensionUri,
			conversationId,
		});
	}
}
