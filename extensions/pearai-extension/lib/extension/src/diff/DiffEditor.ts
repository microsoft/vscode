import * as vscode from "vscode";
import { WebviewContainer } from "../webview/WebviewContainer";

export class DiffEditor {
	private container: WebviewContainer;

	private messageEmitter = new vscode.EventEmitter<unknown>();
	private messageHandler: vscode.Disposable | undefined;

	constructor({
		title,
		editorColumn,
		extensionUri,
		conversationId,
	}: {
		title: string;
		editorColumn: vscode.ViewColumn;
		extensionUri: vscode.Uri;
		conversationId: string;
	}) {
		const panel = vscode.window.createWebviewPanel(
			`pearai.diff.${conversationId}`,
			title,
			editorColumn
		);

		const useVisualStudioCodeColors: boolean = vscode.workspace
			.getConfiguration("pearai.syntaxHighlighting")
			.get("useVisualStudioCodeColors", false);

		this.container = new WebviewContainer({
			panelId: "diff",
			panelCssId: useVisualStudioCodeColors
				? "diff-vscode-colors"
				: "diff-hardcoded-colors",
			isStateReloadingEnabled: true,
			webview: panel.webview,
			extensionUri,
		});

		this.container.onDidReceiveMessage((message: unknown) => {
			this.messageEmitter.fire(message);
		});
	}

	onDidReceiveMessage: vscode.Event<unknown> = (
		listener,
		thisArg,
		disposables
	) => {
		// We only want to execute the last listener to apply the latest change.
		this.messageHandler?.dispose();
		this.messageHandler = this.messageEmitter.event(
			listener,
			thisArg,
			disposables
		);
		return this.messageHandler;
	};

	async updateDiff({
		oldCode,
		newCode,
		languageId,
	}: {
		oldCode: string;
		newCode: string;
		languageId?: string;
	}) {
		await this.container.updateState({
			type: "diff",
			oldCode,
			newCode,
			languageId,
		});
	}
}
