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

	public execute(args: { src: string; id: string }) {
		const columnToShowIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;
		const source = vscode.Uri.parse(args.src);
		if (this._currentPanel) {
			// If we already have a panel, show it in the target column
			this._currentPanel.reveal(columnToShowIn);
		} else {
			this._currentPanel = vscode.window.createWebviewPanel(
				'openImage',
				'Image',
				vscode.ViewColumn.Active,
				{}
			);
		}

		this._webviewManager.findPreview(source)?.openImage(args.src);

	}
}

