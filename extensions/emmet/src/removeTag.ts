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

	const tabSize: number = +editor.options.tabSize!;
	let finalRangesToRemove = editor.selections.reverse()
		.reduce<vscode.Range[]>((prev, selection) =>
			prev.concat(getRangesToRemove(editor.document, selection, tabSize)), []);

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
 * Assumption: The document indents consist of only tabs or only spaces.
 */
function getRangesToRemove(document: vscode.TextDocument, selection: vscode.Selection, tabSize: number): vscode.Range[] {
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
		const indentAmountToRemove = calculateIndentAmountToRemove(document, openTagRange, closeTagRange, tabSize);
		for (let i = openTagRange.start.line + 1; i < closeTagRange.start.line; i++) {
			rangesToRemove.push(new vscode.Range(i, 0, i, indentAmountToRemove));
		}
		rangesToRemove.push(closeTagRange);
	}
	return rangesToRemove;
}

type IndentInfo = {
	indentAmount: number,
	tabsOnly: boolean
};

/**
 * Calculates the amount of indent to remove for getRangesToRemove.
 */
function calculateIndentAmountToRemove(document: vscode.TextDocument, openRange: vscode.Range, closeRange: vscode.Range, tabSize: number): number {
	const startLine = openRange.start.line;
	const endLine = closeRange.start.line;

	const startLineIndent = calculateLineIndentInSpaces(document.lineAt(startLine).text, tabSize);
	const endLineIndent = calculateLineIndentInSpaces(document.lineAt(endLine).text, tabSize);

	let contentIndent: IndentInfo | undefined;
	for (let i = startLine + 1; i <= endLine - 1; i++) {
		const lineContent = document.lineAt(i).text;
		const indent = calculateLineIndentInSpaces(lineContent, tabSize);
		contentIndent = !contentIndent ? indent :
			{
				indentAmount: Math.min(contentIndent.indentAmount, indent.indentAmount),
				tabsOnly: contentIndent.tabsOnly && indent.tabsOnly
			};
	}

	let indentAmountSpaces = 0;
	let tabsOnly = startLineIndent.tabsOnly && endLineIndent.tabsOnly;

	if (contentIndent) {
		if (contentIndent.indentAmount < startLineIndent.indentAmount
			|| contentIndent.indentAmount < endLineIndent.indentAmount) {
			indentAmountSpaces = 0;
		}
		else {
			indentAmountSpaces = Math.min(
				contentIndent.indentAmount - startLineIndent.indentAmount,
				contentIndent.indentAmount - endLineIndent.indentAmount
			);
		}
		tabsOnly = tabsOnly && contentIndent.tabsOnly;
	}
	return tabsOnly ? Math.trunc(indentAmountSpaces / tabSize) : indentAmountSpaces;
}

function calculateLineIndentInSpaces(line: string, tabSize: number): IndentInfo {
	const whiteSpaceMatch = line.match(/^\s+/);
	const whiteSpaceContent = whiteSpaceMatch ? whiteSpaceMatch[0] : '';

	if (!whiteSpaceContent) {
		return { indentAmount: 0, tabsOnly: true };
	}

	let numSpaces = 0;
	let numTabs = 0;
	let tabsOnly = true;
	for (const c of whiteSpaceContent) {
		if (c === '\t') {
			numTabs++;
		}
		else {
			numSpaces++;
			tabsOnly = false;
		}
	}

	return { indentAmount: numTabs * tabSize + numSpaces, tabsOnly };
}
