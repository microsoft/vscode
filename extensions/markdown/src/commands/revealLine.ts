/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { Logger } from '../logger';
import { isMarkdownFile } from '../features/previewContentProvider';

export class RevealLineCommand implements Command {
	public readonly id = '_markdown.revealLine';

	public constructor(
		private readonly logger: Logger
	) { }

	public execute(uri: string, line: number) {
		const sourceUri = vscode.Uri.parse(decodeURIComponent(uri));
		this.logger.log('revealLine', { uri, sourceUri: sourceUri.toString(), line });

		vscode.window.visibleTextEditors
			.filter(editor => isMarkdownFile(editor.document) && editor.document.uri.fsPath === sourceUri.fsPath)
			.forEach(editor => {
				const sourceLine = Math.floor(line);
				const fraction = line - sourceLine;
				const text = editor.document.lineAt(sourceLine).text;
				const start = Math.floor(fraction * text.length);
				editor.revealRange(
					new vscode.Range(sourceLine, start, sourceLine + 1, 0),
					vscode.TextEditorRevealType.AtTop);
			});
	}
}