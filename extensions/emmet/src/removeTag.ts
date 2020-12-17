/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { validate, getHtmlNodeLS, toLSTextDocument, offsetRangeToVsRange } from './util';

export function removeTag() {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}
	const editor = vscode.window.activeTextEditor;
	let finalRangesToRemove = editor.selections.reverse()
		.reduce<vscode.Range[]>((prev, selection) =>
			prev.concat(getRangesToRemove(editor.document, selection)), []);

	return editor.edit(editBuilder => {
		finalRangesToRemove.forEach(range => {
			editBuilder.replace(range, '');
		});
	});
}

/**
 * Calculates the ranges to remove, along with what to replace those ranges with.
 * It finds the node to remove based on the selection's start position
 * and then removes that node, reindenting the content in between.
 */
function getRangesToRemove(document: vscode.TextDocument, selection: vscode.Selection): vscode.Range[] {
	const lsDocument = toLSTextDocument(document);
	const nodeToUpdate = getHtmlNodeLS(lsDocument, selection.start, true);
	if (!nodeToUpdate) {
		return [];
	}

	const openTagRange = offsetRangeToVsRange(lsDocument, nodeToUpdate.start, nodeToUpdate.startTagEnd ?? nodeToUpdate.end);
	let closeTagRange: vscode.Range | undefined;
	if (nodeToUpdate.endTagStart !== undefined) {
		closeTagRange = offsetRangeToVsRange(lsDocument, nodeToUpdate.endTagStart, nodeToUpdate.end);
	}

	let rangesToRemove = [openTagRange];
	if (closeTagRange) {
		const indentAmountToRemove = calculateIndentAmountToRemove(document, openTagRange, closeTagRange);
		for (let i = openTagRange.start.line + 1; i < closeTagRange.start.line; i++) {
			rangesToRemove.push(new vscode.Range(i, 0, i, indentAmountToRemove));
		}
		rangesToRemove.push(closeTagRange);
	}
	return rangesToRemove;
}

/**
 * Calculates the amount of indent to remove for getRangesToRemove.
 */
function calculateIndentAmountToRemove(document: vscode.TextDocument, openRange: vscode.Range, closeRange: vscode.Range): number {
	const startLine = openRange.start.line;
	const endLine = closeRange.start.line;

	const startLineIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;
	const endLineIndent = document.lineAt(endLine).firstNonWhitespaceCharacterIndex;

	let contentIndent: number | undefined;
	for (let i = startLine + 1; i < endLine; i++) {
		const lineIndent = document.lineAt(i).firstNonWhitespaceCharacterIndex;
		contentIndent = !contentIndent ? lineIndent : Math.min(contentIndent, lineIndent);
	}

	let indentAmount = 0;
	if (contentIndent) {
		if (contentIndent < startLineIndent || contentIndent < endLineIndent) {
			indentAmount = 0;
		}
		else {
			indentAmount = Math.min(contentIndent - startLineIndent, contentIndent - endLineIndent);
		}
	}
	return indentAmount;
}
