/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Pattern to match \item with optional [] argument
 */
const ITEM_PATTERN = /^(\s*)\\item(\[[^\]]*\])?\s*(.*)$/;

/**
 * Pattern to match empty \item or \item[]
 */
const EMPTY_ITEM_PATTERN = /^\s*\\item(\[\s*\])?\s*$/;

/**
 * Smart Enter Key handler for LaTeX documents
 *
 * Behavior:
 * - If cursor is at end of a line starting with \item, insert a new \item on the next line
 * - If the current line is an empty \item, delete it and insert a normal newline
 * - Otherwise, insert a normal newline
 */
export async function onEnterKey(modifiers?: string): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	// Check configuration
	const config = vscode.workspace.getConfiguration('latex');
	if (!config.get<boolean>('smartEnter.enabled', true)) {
		// Just insert a normal newline
		await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
		return;
	}

	// Alt+Enter always inserts line after
	if (modifiers === 'alt') {
		await vscode.commands.executeCommand('editor.action.insertLineAfter');
		return;
	}

	// Check if all cursors are at the end of lines starting with \item
	const allCursorsOnItem = editor.selections.every(selection => {
		const cursorPos = selection.active;
		const line = editor.document.lineAt(cursorPos.line);
		const lineText = line.text;

		// Check if line starts with \item
		if (!ITEM_PATTERN.test(lineText)) {
			return false;
		}

		// Check if cursor is at end of line (only whitespace after cursor)
		const textAfterCursor = lineText.substring(cursorPos.character).trim();
		return textAfterCursor.length === 0;
	});

	if (!allCursorsOnItem) {
		// Normal newline
		await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
		return;
	}

	// Handle smart item insertion
	await editor.edit(editBuilder => {
		for (const selection of editor.selections) {
			const cursorPos = selection.active;
			const line = editor.document.lineAt(cursorPos.line);
			const lineText = line.text;

			// Get indentation
			const indentation = lineText.substring(0, line.firstNonWhitespaceCharacterIndex);

			if (EMPTY_ITEM_PATTERN.test(lineText)) {
				// Empty \item or \item[] - delete the content and just leave indentation
				const rangeToDelete = line.range.with(
					cursorPos.with(line.lineNumber, line.firstNonWhitespaceCharacterIndex),
					line.range.end
				);
				editBuilder.delete(rangeToDelete);
			} else {
				// Check what type of \item it is
				const match = lineText.match(ITEM_PATTERN);
				if (match) {
					const hasSquareBrackets = match[2] !== undefined; // \item[...]
					const content = match[3]; // Content after \item

					if (hasSquareBrackets || content.length > 0) {
						// Line has content or uses \item[], insert new \item
						if (hasSquareBrackets) {
							// Insert \item[] on new line
							editBuilder.insert(cursorPos, `\n${indentation}\\item[] `);
						} else {
							// Insert \item on new line
							editBuilder.insert(cursorPos, `\n${indentation}\\item `);
						}
					} else {
						// Fallback: just insert newline with indentation
						editBuilder.insert(cursorPos, `\n${indentation}`);
					}
				}
			}
		}
	});
}

/**
 * Handle Alt+Enter - always insert line after
 */
export async function onAltEnterKey(): Promise<void> {
	await onEnterKey('alt');
}

/**
 * Register smart enter key handler
 */
export function registerSmartEnterProvider(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('latex.onEnterKey', () => onEnterKey())
	);

	disposables.push(
		vscode.commands.registerCommand('latex.onAltEnterKey', onAltEnterKey)
	);

	return disposables;
}

