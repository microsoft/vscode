/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ICommand } from './commandManager';
import { LatexService } from '../latexService';
import { OutputChannelLogger } from '../utils/logger';

export class CleanCommand implements ICommand {
	readonly id = 'latex.clean';

	constructor(
		private readonly latexService: LatexService,
		private readonly logger: OutputChannelLogger
	) { }

	async execute(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor');
			return;
		}

		const document = editor.document;
		if (document.languageId !== 'latex' && document.languageId !== 'tex') {
			vscode.window.showWarningMessage('Active document is not a LaTeX file');
			return;
		}

		this.logger.show();
		this.logger.info(`Cleaning LaTeX artifacts for: ${document.fileName}`);

		try {
			await this.latexService.clean(document.uri);
			vscode.window.showInformationMessage('LaTeX clean completed');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Clean failed: ${message}`);
			vscode.window.showErrorMessage(`LaTeX clean failed: ${message}`);
		}
	}
}

