/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { validate } from './util';

export function fetchEditPoint(direction: string): void {
	let editor = vscode.window.activeTextEditor;
	if (!validate()) {
		return;
	}

	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		let updatedSelection = direction === 'next' ? nextEditPoint(selection.anchor, editor) : prevEditPoint(selection.anchor, editor);
		newSelections.push(updatedSelection ? updatedSelection : selection);
	});
	editor.selections = newSelections;
	editor.revealRange(editor.selections[editor.selections.length - 1]);
}

function nextEditPoint(position: vscode.Position, editor: vscode.TextEditor): vscode.Selection {
	for (let lineNum = position.line; lineNum < editor.document.lineCount; lineNum++) {
		let updatedSelection = findEditPoint(lineNum, editor, position, 'next');
		if (updatedSelection) {
			return updatedSelection;
		}
	}
}

function prevEditPoint(position: vscode.Position, editor: vscode.TextEditor): vscode.Selection {
	for (let lineNum = position.line; lineNum >= 0; lineNum--) {
		let updatedSelection = findEditPoint(lineNum, editor, position, 'prev');
		if (updatedSelection) {
			return updatedSelection;
		}
	}
}


function findEditPoint(lineNum: number, editor: vscode.TextEditor, position: vscode.Position, direction: string): vscode.Selection {
	let line = editor.document.lineAt(lineNum);
	let lineContent = line.text;

	if (lineNum !== position.line && line.isEmptyOrWhitespace) {
		return new vscode.Selection(lineNum, lineContent.length, lineNum, lineContent.length);
	}

	if (lineNum === position.line && direction === 'prev') {
		lineContent = lineContent.substr(0, position.character);
	}
	let emptyAttrIndex = direction === 'next' ? lineContent.indexOf('""', lineNum === position.line ? position.character : 0) : lineContent.lastIndexOf('""');
	let emptyTagIndex = direction === 'next' ? lineContent.indexOf('><', lineNum === position.line ? position.character : 0) : lineContent.lastIndexOf('><');

	let winner = -1;

	if (emptyAttrIndex > -1 && emptyTagIndex > -1) {
		winner = direction === 'next' ? Math.min(emptyAttrIndex, emptyTagIndex) : Math.max(emptyAttrIndex, emptyTagIndex);
	} else if (emptyAttrIndex > -1) {
		winner = emptyAttrIndex;
	} else {
		winner = emptyTagIndex;
	}

	if (winner > -1) {
		return new vscode.Selection(lineNum, winner + 1, lineNum, winner + 1);
	}
}
