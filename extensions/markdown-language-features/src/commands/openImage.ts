/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownPreviewManager } from '../preview/previewManager';

export class OpenImageCommand implements Command {
	public readonly id = '_markdown.openImage';
	public constructor(
		private readonly _webviewManager: MarkdownPreviewManager,
		private _currentPanel: vscode.WebviewPanel | undefined = undefined
	) { }

	public execute(args: { id: string; resource: string }) {
		const columnToShowIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;
		const source = vscode.Uri.parse(args.resource);
		if (this._currentPanel) {
			// If we already have a panel, show it in the target column
			this._currentPanel.reveal(columnToShowIn);
		} else {
			this._currentPanel = vscode.window.createWebviewPanel(
				'opemImage',
				'Image',
				vscode.ViewColumn.Beside,
				{}
			);
		}
		console.log(source);
		this._webviewManager.findPreview(source)?.openImage(args.id);
		this._currentPanel.webview.html = getWebviewContent(args.id);
	}
}
function getWebviewContent(imgId: string): string {
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Cat Coding</title>
	</head>
	<body>
		<img src="${[imgId]}" width="300" />
	</body>
	</html>`;
}

