/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import Node from '@emmetio/node';
import { getNode, parse, validate } from './util';

export function splitJoinTag() {
	let editor = vscode.window.activeTextEditor;
	if (!validate(false)) {
		return;
	}

	let rootNode = parse(editor.document);
	if (!rootNode) {
		return;
	}

	editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			let [rangeToReplace, textToReplaceWith] = getRangesToReplace(editor.document, selection, rootNode);
			if (rangeToReplace && textToReplaceWith) {
				editBuilder.replace(rangeToReplace, textToReplaceWith);
			}
		});
	});
}

function getRangesToReplace(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): [vscode.Range, string] {
	let nodeToUpdate: Node = getNode(rootNode, selection.start);
	let rangeToReplace: vscode.Range;
	let textToReplaceWith: string;

	if (!nodeToUpdate) {
		return [null, null];
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

	return [rangeToReplace, textToReplaceWith];
}