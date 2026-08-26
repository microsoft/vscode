/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';

const ERROR_OUTPUT_MIME_TYPE = 'application/vnd.code.notebook.error';
export class NotebookExectionStatusBarItemProvider implements vscode.NotebookCellStatusBarItemProvider {
	constructor(@ILogService private readonly logService: ILogService) { }

	async provideCellStatusBarItems(
		cell: vscode.NotebookCell,
		token: vscode.CancellationToken
	): Promise<vscode.NotebookCellStatusBarItem[]> {
		// check if quickfix contributions should come from core instead of copilot
		const coreQuickFix = vscode.workspace.getConfiguration('notebook').get<boolean>('cellFailureDiagnostics');
		if (coreQuickFix) {
			return [];
		}

		if (cell.kind === vscode.NotebookCellKind.Markup) {
			// show generate button for markdown cells
			// only show this when `notebook.experimental.cellChat` is enabled and the cell is not empty
			const enabled = vscode.workspace.getConfiguration('notebook.experimental').get<boolean>('cellChat');

			if (!enabled) {
				return [];
			}

			const documentContent = cell.document.getText().trim();
			if (!enabled || documentContent.length === 0) {
				return [];
			}

			const title = l10n.t('Generate code from markdown content');
			const message = documentContent;

			return [
				{
					text: `$(sparkle)`,
					alignment: vscode.NotebookCellStatusBarAlignment.Left,
					priority: Number.MAX_SAFE_INTEGER - 1,
					tooltip: title,
					command: {
						title: title,
						command: 'notebook.cell.chat.start',
						arguments: [
							{
								index: cell.index + 1,
								input: message,
								autoSend: true
							},
						],
					},
				},
			];
		}


		const outputItem = cell.outputs
			.flatMap(output => output.items)
			.find(item => item.mime === ERROR_OUTPUT_MIME_TYPE);

		if (!outputItem) {
			return [];
		}

		type ErrorLike = Partial<Error>;

		let err: ErrorLike;
		try {
			const textDecoder = new TextDecoder();
			err = <ErrorLike>JSON.parse(textDecoder.decode(outputItem.data));

			if (!err.name && !err.message) {
				return [];
			}

			const title = l10n.t('Fix using Copilot');
			// remove the file and line number from the error message as they are in-memory
			const joinedMessage = [err.name, err.message].filter(Boolean).join(': ').replace(/\s*\(\S+,\s*line\s*\d+\)/, '');

			return [
				{
					text: `$(sparkle)`,
					alignment: vscode.NotebookCellStatusBarAlignment.Left,
					priority: Number.MAX_SAFE_INTEGER - 1,
					tooltip: title,
					command: {
						title: title,
						command: 'vscode.editorChat.start',
						arguments: [
							{
								autoSend: true,
								message: `/fix ${joinedMessage}`,
							},
						],
					},
				}
			];
		} catch (e) {
			this.logService.error(`Failed to parse error output ${e}`);
		}

		return [];
	}
}
