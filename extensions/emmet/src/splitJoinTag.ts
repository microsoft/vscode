/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HtmlNode } from 'EmmetNode';
import { getNode, parseDocument, validate } from './util';

export function splitJoinTag() {
	let editor = vscode.window.activeTextEditor;
	if (!validate(false)) {
		return;
	}

	let rootNode = <HtmlNode>parseDocument(editor.document);
	if (!rootNode) {
		return;
	}

	return editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			let textEdit = getRangesToReplace(editor.document, selection, rootNode);
			if (textEdit) {
				editBuilder.replace(textEdit.range, textEdit.newText);
			}
		});
	});
}

function getRangesToReplace(document: vscode.TextDocument, selection: vscode.Selection, rootNode: HtmlNode): vscode.TextEdit {
	let nodeToUpdate = <HtmlNode>getNode(rootNode, selection.start);
	let rangeToReplace: vscode.Range;
	let textToReplaceWith: string;

	if (!nodeToUpdate) {
		return;
	}

	if (!nodeToUpdate.close) {
		// Split Tag
		let nodeText = document.getText(new vscode.Range(nodeToUpdate.start, nodeToUpdate.end));
		let m = nodeText.match(/(\s*\/)?>$/);
		let end = <vscode.Position>nodeToUpdate.end;
		let start = m ? end.translate(0, -m[0].length) : end;

		rangeToReplace = new vscode.Range(start, end);
		textToReplaceWith = `></${nodeToUpdate.name}>`;
	} else {
		// Join Tag
		let start = (<vscode.Position>nodeToUpdate.open.end).translate(0, -1);
		let end = <vscode.Position>nodeToUpdate.end;
		rangeToReplace = new vscode.Range(start, end);
		textToReplaceWith = '/>';
	}

	return new vscode.TextEdit(rangeToReplace, textToReplaceWith);
}