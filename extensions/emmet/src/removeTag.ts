/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getOpenCloseRange } from './util';

export function removeTag() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}

	let indentInSpaces = '';
	for (let i = 0; i < editor.options.tabSize; i++) {
		indentInSpaces += ' ';
	}

	let rangesToRemove = [];
	editor.selections.reverse().forEach(selection => {
		rangesToRemove = rangesToRemove.concat(getRangeToRemove(editor, selection, indentInSpaces));
	});

	editor.edit(editBuilder => {
		rangesToRemove.forEach(range => {
			editBuilder.replace(range, '');
		});
	});
}

function getRangeToRemove(editor: vscode.TextEditor, selection: vscode.Selection, indentInSpaces: string): vscode.Range[] {
	let [openRange, closeRange] = getOpenCloseRange(editor.document, selection.start);
	if (!openRange.contains(selection.start) && !closeRange.contains(selection.start)) {
		return [];
	}
	let ranges = [openRange];
	if (closeRange) {
		for (let i = openRange.start.line + 1; i <= closeRange.start.line; i++) {
			let lineContent = editor.document.lineAt(i).text;
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


