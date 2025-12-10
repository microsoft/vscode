/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ICommand } from './commandManager';
import { LatexService } from '../latexService';
import { OutputChannelLogger } from '../utils/logger';

export class BuildCommand implements ICommand {
	readonly id = 'latex.build';

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
		this.logger.info(`Building LaTeX document: ${document.fileName}`);

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Building LaTeX document...',
					cancellable: false
				},
				async () => {
					// Check mode to determine if we should suppress fallback errors
					const config = vscode.workspace.getConfiguration('latex');
					const mode = config.get<string>('compilation.mode', 'auto');
					const recipe = config.get<string>('compilation.recipe', 'latexmk');

					this.logger.info(`Build command: mode=${mode}, recipe=${recipe}`);

					const result = await this.latexService.build(document.uri);
					if (result.success) {
						if (result.fallbackUsed) {
							// Fallback was used but compilation succeeded - show info instead of success
							this.logger.info('LaTeX compilation successful (using server compiler)');
						} else {
							vscode.window.showInformationMessage('LaTeX compilation successful');
						}
					} else {
						const errorMessage = result.error || 'Unknown error';
						// Don't show error notification if it's a fallback message in auto mode
						// In auto mode, fallback should happen automatically
						const isFallbackMessage = errorMessage.includes('not supported by WASM compiler') &&
							errorMessage.includes('set compilation.mode to "server"');

						if (isFallbackMessage && mode === 'auto') {
							// This is just a fallback message in auto mode - don't show error
							// The fallback should have already happened, but if it didn't, log it
							this.logger.warn('WASM compiler reported unsupported recipe, but fallback may not have completed. Check logs.');
							// Don't show error notification - fallback should have happened automatically
							return; // Exit early
						}

						// If mode is "wasm" and recipe isn't supported, suggest using "auto" mode
						if (isFallbackMessage && mode === 'wasm') {
							this.logger.error(`Recipe "${recipe}" is not supported in WASM mode. Consider using "auto" mode for automatic fallback.`);
							// Still show the error, but it's expected behavior when mode is "wasm"
						}

						const actions: string[] = [];
						// Always show "Open Problems" - this is the main way to see errors
						actions.push('Open Problems');

						// Try to add "Show Log" if Output view might be available
						// Note: "Show Log" opens the Output panel with raw compilation logs
						// "Open Problems" shows parsed errors with line numbers (recommended)
						if (result.logContent) {
							actions.push('Show Log');
						}

						vscode.window.showErrorMessage(`LaTeX compilation failed: ${errorMessage}`, ...actions).then(selection => {
							if (selection === 'Open Problems') {
								// Open Problems pane - shows parsed errors with line numbers
								vscode.commands.executeCommand('workbench.actions.view.problems');
							} else if (selection === 'Show Log') {
								// Try to show the LaTeX output channel (raw compilation log)
								// This may not work if Output view is disabled in your environment
								try {
									this.logger.show();
									// Try to open Output view if available (ignore errors if not available)
									vscode.commands.executeCommand('workbench.action.output.toggleOutput').then(
										() => { /* Success - Output view opened */ },
										() => { /* Output view not available - that's okay, Problems pane has the errors */ }
									);
								} catch (error) {
									// Output panel not available - show a message
									vscode.window.showInformationMessage(
										'Output view is not available. Check the Problems pane for detailed error information.',
										'Open Problems'
									).then(action => {
										if (action === 'Open Problems') {
											vscode.commands.executeCommand('workbench.actions.view.problems');
										}
									});
								}
							}
						});
					}
				}
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Build failed: ${message}`);
			vscode.window.showErrorMessage(`LaTeX build failed: ${message}`);
		}
	}
}

