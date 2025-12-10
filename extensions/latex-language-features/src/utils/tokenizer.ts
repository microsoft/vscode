/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * If the string at `position` is a latex command, e.g., `\macro`, `\macro{` or `\macro[`,
 * return the range of the command string (`\macro`).
 *
 * Ported from latex-workshop tokenizer
 *
 * @param document The document to be scanned.
 * @param position The position to be scanned at.
 */
function macroTokenizer(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
	let startRegex: RegExp;
	if (document.languageId === 'latex-expl3') {
		startRegex = /\\(?=[^\\{},[\]]*$)/;
	} else {
		startRegex = /\\(?=[a-zA-Z]*$)/;
	}

	const startResult = document.getText(new vscode.Range(new vscode.Position(position.line, 0), position)).match(startRegex);
	if (startResult === null || startResult.index === undefined || startResult.index < 0) {
		return;
	}

	const firstBracket = document.getText(new vscode.Range(position, new vscode.Position(position.line, 65535))).match(/[[{]/);
	if (firstBracket && firstBracket.index !== undefined && firstBracket.index > 0) {
		return new vscode.Range(
			new vscode.Position(position.line, startResult.index),
			new vscode.Position(position.line, position.character + firstBracket.index)
		);
	}

	const wordRange = document.getWordRangeAtPosition(position);
	if (wordRange) {
		return wordRange.with(new vscode.Position(position.line, startResult.index));
	}
	return;
}

/**
 * If the string at `position` is surrounded by `{...}` or `[...]`,
 * return the range for the argument at `position` inside the brackets.
 *
 * Ported from latex-workshop tokenizer
 *
 * @param document The document to be scanned.
 * @param position The position to be scanned at.
 */
function argTokenizer(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
	const startResult = document.getText(new vscode.Range(new vscode.Position(position.line, 0), position)).match(/[{,[](?=[^{},[\]]*$)/);
	if (startResult === null || startResult.index === undefined || startResult.index < 0) {
		return;
	}

	const endResult = document.getText(new vscode.Range(position, new vscode.Position(position.line, 65535))).match(/[}\],]/);
	if (endResult === null || endResult.index === undefined || endResult.index < 0) {
		return;
	}

	return new vscode.Range(
		new vscode.Position(position.line, startResult.index + 1),
		new vscode.Position(position.line, position.character + endResult.index)
	);
}

/**
 * If the string at `position` is like `\macro{` or `\macro[`, then
 * returns the range for `\macro`. If it is like `{...}` or `[...]`, then
 * returns the range of the argument inside brackets.
 *
 * Ported from latex-workshop tokenizer
 *
 * @param document The document to be scanned.
 * @param position The position to be scanned at.
 */
export function tokenizer(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
	// \macro case
	const macroToken = macroTokenizer(document, position);
	if (macroToken) {
		return macroToken;
	}

	// Inside {...} or [...]
	const argToken = argTokenizer(document, position);
	if (argToken) {
		return argToken;
	}

	return;
}

/**
 * Escape special regex characters in a string
 * Ported from latex-workshop utils
 */
export function escapeRegExp(str: string): string {
	return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

/**
 * Remove surrounding quotes from a file path if present
 */
export function sanitizeInputFilePath(filePath: string): string {
	if (filePath.startsWith('"') && filePath.endsWith('"')) {
		return filePath.slice(1, -1);
	}
	return filePath;
}

