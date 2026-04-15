/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from './commandManager';

/**
 * Inserts a `console.log` statement for the currently selected text or the word
 * under the cursor.
 *
 * Usage: select a variable name (or place the cursor on it) and invoke the command.
 * A `console.log('<name>:', <name>)` statement is inserted on the line immediately
 * after the current line, indented to match.
 *
 * Example – given:
 *   const myVar = getSomeValue();   // cursor/selection on `myVar`
 *
 * The command produces:
 *   const myVar = getSomeValue();
 *   console.log('myVar:', myVar);
 */
export class InsertConsoleLogCommand implements Command {
	public static readonly ID = 'typescript.insertConsoleLog';
	public readonly id = InsertConsoleLogCommand.ID;

	public async execute(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const document = editor.document;
		const selection = editor.selection;

		// Resolve the target symbol: prefer explicit selection, fall back to word at cursor.
		let symbol: string;
		if (!selection.isEmpty) {
			symbol = document.getText(selection);
		} else {
			const wordRange = document.getWordRangeAtPosition(selection.active);
			if (!wordRange) {
				return;
			}
			symbol = document.getText(wordRange);
		}

		symbol = symbol.trim();
		if (!symbol) {
			return;
		}

		// Derive indentation from the current line so the inserted statement aligns naturally.
		const currentLine = document.lineAt(selection.active.line);
		const indentMatch = currentLine.text.match(/^(\s*)/);
		const indent = indentMatch ? indentMatch[1] : '';

		const logStatement = `${indent}console.log('${symbol}:', ${symbol});`;

		// Insert on the line immediately after the current line.
		const endOfCurrentLine = currentLine.range.end;

		const success = await editor.edit(editBuilder => {
			editBuilder.insert(endOfCurrentLine, `\n${logStatement}`);
		});

		if (success) {
			// Move the cursor to the end of the newly inserted statement.
			const newLineNumber = currentLine.lineNumber + 1;
			const newLineLength = logStatement.length;
			const newPosition = new vscode.Position(newLineNumber, newLineLength);
			editor.selection = new vscode.Selection(newPosition, newPosition);
			editor.revealRange(new vscode.Range(newPosition, newPosition));
		}
	}
}
