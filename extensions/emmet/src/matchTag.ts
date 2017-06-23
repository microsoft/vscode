/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { DocumentStreamReader } from './bufferStream';
import { getNode } from './util';

export function matchTag() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}

	let rootNode: Node = parse(new DocumentStreamReader(editor.document));
	let updatedSelections = [];
	editor.selections.forEach(selection => {
		let updatedSelection = getUpdatedSelections(editor, selection.start, rootNode);
		if (updatedSelection) {
			updatedSelections.push(updatedSelection);
		}
	});
	if (updatedSelections.length > 0) {
		editor.selections = updatedSelections;
		editor.revealRange(editor.selections[updatedSelections.length - 1]);
	}
}

function getUpdatedSelections(editor: vscode.TextEditor, position: vscode.Position, rootNode: Node): vscode.Selection {
	let currentNode = getNode(rootNode, position, true);

	// If no closing tag or cursor is between open and close tag, then no-op
	if (!currentNode.close || (position.isAfter(currentNode.open.end) && position.isBefore(currentNode.close.start))) {
		return;
	}

	let finalPosition = position.isBeforeOrEqual(currentNode.open.end) ? currentNode.close.start : currentNode.open.start;
	return new vscode.Selection(finalPosition, finalPosition);
}


