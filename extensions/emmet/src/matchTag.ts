/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode } from './util';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';

export function matchTag() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}

	let rootNode: Node = parse(editor.document.getText());
	let updatedSelections = [];
	editor.selections.forEach(selection => {
		let updatedSelection = getUpdatedSelections(editor, editor.document.offsetAt(selection.start), rootNode);
		if (updatedSelection) {
			updatedSelections.push(updatedSelection);
		}
	});
	if (updatedSelections.length > 0) {
		editor.selections = updatedSelections;
	}
}

function getUpdatedSelections(editor: vscode.TextEditor, offset: number, rootNode: Node): vscode.Selection {
	let currentNode = getNode(rootNode, offset);

	// If no closing tag or cursor is between open and close tag, then no-op
	if (!currentNode.close || (currentNode.open.end < offset && currentNode.close.start > offset)) {
		return;
	}

	if (offset <= currentNode.open.end) {
		let matchingPosition = editor.document.positionAt(currentNode.close.start);
		return new vscode.Selection(matchingPosition, matchingPosition);
	} else {
		let matchingPosition = editor.document.positionAt(currentNode.open.start);
		return new vscode.Selection(matchingPosition, matchingPosition);
	}

}


