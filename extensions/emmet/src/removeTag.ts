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
	const indentInSpaces = tabSize ? ' '.repeat(tabSize) : '';
	const rangesToRemove = editor.selections.reverse()
		.reduce<vscode.Range[]>((prev, selection) =>
			prev.concat(getRangeToRemove(editor.document, selection, indentInSpaces)), []);

	return editor.edit(editBuilder => {
		rangesToRemove.forEach(range => {
			editBuilder.replace(range, '');
		});
	});
}

function getRangeToRemove(document: vscode.TextDocument, selection: vscode.Selection, indentInSpaces: string): vscode.Range[] {
	const lsDocument = toLSTextDocument(document);
	const nodeToUpdate = getHtmlNodeLS(lsDocument, selection.start, true);
	if (!nodeToUpdate) {
		return [];
	}

	const openRange = offsetRangeToVsRange(lsDocument, nodeToUpdate.start, nodeToUpdate.startTagEnd ?? nodeToUpdate.end);
	let closeRange: vscode.Range | null = null;
	if (nodeToUpdate.endTagStart !== undefined) {
		closeRange = offsetRangeToVsRange(lsDocument, nodeToUpdate.endTagStart, nodeToUpdate.end);
	}

	let ranges = [openRange];
	if (closeRange) {
		for (let i = openRange.start.line + 1; i <= closeRange.start.line; i++) {
			let lineContent = document.lineAt(i).text;
			if (lineContent.startsWith('\t')) {
				ranges.push(new vscode.Range(i, 0, i, 1));
			} else if (lineContent.startsWith(indentInSpaces)) {
				ranges.push(new vscode.Range(i, 0, i, indentInSpaces.length));
			}
		}
		ranges.push(closeRange);
	}
	return ranges;
}
