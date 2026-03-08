/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LlmClient } from '../llm/LlmClient';

/**
 * Provides inline edit functionality triggered by Cmd+K / Ctrl+K.
 * Expands selection to the nearest logical block, prompts for an instruction,
 * sends context to the LLM, and renders a diff for accept/reject.
 */
export class InlineEditProvider {
	private readonly llmClient: LlmClient;

	constructor(llmClient: LlmClient) {
		this.llmClient = llmClient;
	}

	async provideInlineEdit(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor for inline edit.');
			return;
		}

		// Get or expand selection
		let selection = editor.selection;
		if (selection.isEmpty) {
			selection = this.expandToBlock(editor);
		}

		const selectedText = editor.document.getText(selection);
		if (!selectedText.trim()) {
			vscode.window.showWarningMessage('No code selected for inline edit.');
			return;
		}

		// Prompt for edit instruction
		const instruction = await vscode.window.showInputBox({
			prompt: 'Describe the edit you want to make',
			placeHolder: 'e.g., add error handling, convert to async, rename variables...',
		});

		if (!instruction) {
			return; // User cancelled
		}

		// Gather context
		const document = editor.document;
		const startLine = Math.max(0, selection.start.line - 50);
		const endLine = Math.min(document.lineCount - 1, selection.end.line + 50);

		const beforeContext = document.getText(
			new vscode.Range(startLine, 0, selection.start.line, 0)
		);

		// Safely compute context after the selection without going past the end of the document
		let afterContext = '';
		if (selection.end.line < document.lineCount - 1) {
			const afterStartLine = Math.min(document.lineCount - 1, selection.end.line + 1);
			if (afterStartLine <= endLine) {
				const afterStartPos = new vscode.Position(afterStartLine, 0);
				const afterEndPos = document.lineAt(endLine).range.end;
				afterContext = document.getText(new vscode.Range(afterStartPos, afterEndPos));
			}
		}
		const prompt = this.buildPrompt({
			filePath: document.fileName,
			language: document.languageId,
			selectedCode: selectedText,
			beforeContext,
			afterContext,
			instruction,
		});

		// Show progress
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Son of Anton: Generating edit...',
				cancellable: true,
			},
			async (_progress, cancellationToken) => {
				const abortController = new AbortController();
				cancellationToken.onCancellationRequested(() => abortController.abort());

				try {
					const result = await this.llmClient.request({
						model: 'sonnet',
						messages: [{ role: 'user', content: prompt }],
						systemPrompt: 'You are a code editing assistant. Return ONLY the modified code with no explanations, no markdown fences, no surrounding text. The code should be a direct replacement for the selected region.',
						signal: abortController.signal,
					});

					const newCode = result.trim();
					await this.showDiff(editor, selection, selectedText, newCode);
				} catch (err) {
					if (!abortController.signal.aborted) {
						vscode.window.showErrorMessage(`Inline edit failed: ${err}`);
					}
				}
			}
		);
	}

	/**
	 * Expand an empty selection to the nearest logical block
	 * (function, class, or paragraph of code).
	 */
	private expandToBlock(editor: vscode.TextEditor): vscode.Selection {
		const document = editor.document;
		const position = editor.selection.active;
		const line = position.line;

		// Try to find a function/class boundary using indentation
		const currentIndent = this.getIndentLevel(document.lineAt(line).text);

		let startLine = line;
		let endLine = line;

		// Walk up to find the start of the block
		for (let i = line - 1; i >= 0; i--) {
			const lineText = document.lineAt(i).text;
			if (lineText.trim() === '') {
				// Empty line — check if we've found a meaningful boundary
				if (startLine !== line) {
					break;
				}
				continue;
			}
			const indent = this.getIndentLevel(lineText);
			if (indent < currentIndent) {
				startLine = i;
				break;
			}
			startLine = i;
		}

		// Walk down to find the end of the block
		for (let i = line + 1; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text;
			if (lineText.trim() === '') {
				if (endLine !== line) {
					break;
				}
				continue;
			}
			const indent = this.getIndentLevel(lineText);
			if (indent < currentIndent) {
				break;
			}
			endLine = i;
		}

		return new vscode.Selection(
			startLine, 0,
			endLine, document.lineAt(endLine).text.length
		);
	}

private getIndentLevel(line: string, tabSize: number): number {
		let count = 0;
		for (const ch of line) {
			if (ch === '\t') {
				count += tabSize;
			} else if (ch === ' ') {
				count += 1;
			} else {
				break;
			}
		}
		return count;
	}

	private buildPrompt(params: {
		filePath: string;
		language: string;
		selectedCode: string;
		beforeContext: string;
		afterContext: string;
		instruction: string;
	}): string {
		return [
			`File: ${params.filePath}`,
			`Language: ${params.language}`,
			'',
			'=== Code before selection ===',
			params.beforeContext,
			'=== Selected code (to be modified) ===',
			params.selectedCode,
			'=== Code after selection ===',
			params.afterContext,
			'',
			`Instruction: ${params.instruction}`,
			'',
			'Return the modified version of the selected code. Keep the same indentation style and conventions.',
		].join('\n');
	}

	/**
	 * Show the proposed edit as a diff and let the user accept or reject.
	 */
	private async showDiff(
		editor: vscode.TextEditor,
		selection: vscode.Selection,
		_originalCode: string,
		newCode: string,
	): Promise<void> {
		const result = await vscode.window.showInformationMessage(
			'Son of Anton: Apply this edit?',
			{ modal: false },
			'Accept',
			'Reject'
		);

		if (result === 'Accept') {
			const edit = new vscode.WorkspaceEdit();
			edit.replace(editor.document.uri, selection, newCode);
			await vscode.workspace.applyEdit(edit);
			vscode.window.showInformationMessage('Edit applied.');
		}

		// LIMITATION: The VS Code extension API does not provide a way to show
		// an inline diff overlay with accept/reject buttons within the editor.
		// We fall back to a modal-like notification. A fork modification could
		// integrate with the diff editor for a richer experience.
		// See: docs/extension-api-limitations.md
	}
}
