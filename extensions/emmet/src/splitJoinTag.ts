/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isStyleSheet, getNode } from './util';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';

export function splitJoinTag() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	if (isStyleSheet(editor.document.languageId)) {
		return;
	}

	let rootNode: Node = parse(editor.document.getText());

	editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			let [rangeToReplace, textToReplaceWith] = getRangesToReplace(editor.document, selection, rootNode);
			editBuilder.replace(rangeToReplace, textToReplaceWith);
		});
	});
}

function getRangesToReplace(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): [vscode.Range, string] {
	let offset = document.offsetAt(selection.start);
	let nodeToUpdate: Node = getNode(rootNode, offset);
	let rangeToReplace: vscode.Range;
	let textToReplaceWith: string;

	if (!nodeToUpdate.close) {
		// Split Tag
		let nodeText = document.getText(new vscode.Range(document.positionAt(nodeToUpdate.start), document.positionAt(nodeToUpdate.end)));
		let m = nodeText.match(/(\s*\/)?>$/);
		let end = nodeToUpdate.open.end;
		let start = m ? end - m[0].length : end;

		rangeToReplace = new vscode.Range(document.positionAt(start), document.positionAt(end));
		textToReplaceWith = `></${nodeToUpdate.name}>`;
	} else {
		// Join Tag
		rangeToReplace = new vscode.Range(document.positionAt(nodeToUpdate.open.end - 1), document.positionAt(nodeToUpdate.close.end));
		textToReplaceWith = '/>';
	}

	return [rangeToReplace, textToReplaceWith];
}