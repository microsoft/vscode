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
	) { }

	public execute(args: { resource: string; imageSource: string }) {
		const source = vscode.Uri.parse(args.resource);
		const imageSourceUri = vscode.Uri.file(vscode.Uri.parse(args.imageSource).path);
		vscode.commands.executeCommand('vscode.open', imageSourceUri, this._webviewManager.findPreview(source));
	}
}
