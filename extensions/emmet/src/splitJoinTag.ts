/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { DocumentStreamReader } from './bufferStream';
import { isStyleSheet } from 'vscode-emmet-helper';
import { getNode } from './util';

export function splitJoinTag() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	if (isStyleSheet(editor.document.languageId)) {
		return;
	}

	let rootNode: Node = parse(new DocumentStreamReader(editor.document));

	editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			let [rangeToReplace, textToReplaceWith] = getRangesToReplace(editor.document, selection, rootNode);
			editBuilder.replace(rangeToReplace, textToReplaceWith);
		});
	});
}

function getRangesToReplace(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): [vscode.Range, string] {
	let nodeToUpdate: Node = getNode(rootNode, selection.start);
	let rangeToReplace: vscode.Range;
	let textToReplaceWith: string;

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

	return [rangeToReplace, textToReplaceWith];
}