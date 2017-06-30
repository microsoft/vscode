/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { parse, validate, getNode } from './util';
import { HtmlNode } from 'EmmetNode';

export function removeTag() {
	let editor = vscode.window.activeTextEditor;
	if (!validate(false)) {
		return;
	}

	let rootNode = <HtmlNode>parse(editor.document);
	if (!rootNode) {
		return;
	}

	let indentInSpaces = '';
	for (let i = 0; i < editor.options.tabSize; i++) {
		indentInSpaces += ' ';
	}

	let rangesToRemove = [];
	editor.selections.reverse().forEach(selection => {
		rangesToRemove = rangesToRemove.concat(getRangeToRemove(editor, rootNode, selection, indentInSpaces));
	});

	editor.edit(editBuilder => {
		rangesToRemove.forEach(range => {
			editBuilder.replace(range, '');
		});
	});
}

function getRangeToRemove(editor: vscode.TextEditor, rootNode: HtmlNode, selection: vscode.Selection, indentInSpaces: string): vscode.Range[] {

	let nodeToUpdate = <HtmlNode>getNode(rootNode, selection.start);
	if (!nodeToUpdate) {
		return [];
	}

	let openRange = new vscode.Range(nodeToUpdate.open.start, nodeToUpdate.open.end);
	let closeRange = null;
	if (nodeToUpdate.close) {
		closeRange = new vscode.Range(nodeToUpdate.close.start, nodeToUpdate.close.end);
	}

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

