/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { DocumentStreamReader } from './bufferStream';
import { getNode } from './util';

export function updateTag(tagName: string) {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}

	let rootNode: Node = parse(new DocumentStreamReader(editor.document));
	let rangesToUpdate = [];
	editor.selections.reverse().forEach(selection => {
		rangesToUpdate = rangesToUpdate.concat(getRangesToUpdate(editor, selection, rootNode));
	});

	editor.edit(editBuilder => {
		rangesToUpdate.forEach(range => {
			editBuilder.replace(range, tagName);
		});
	});
}

function getRangesToUpdate(editor: vscode.TextEditor, selection: vscode.Selection, rootNode: Node): vscode.Range[] {
	let nodeToUpdate = getNode(rootNode, selection.start);

	let openStart = (<vscode.Position>nodeToUpdate.open.start).translate(0, 1);
	let openEnd = openStart.translate(0, nodeToUpdate.name.length);

	let ranges = [new vscode.Range(openStart, openEnd)];
	if (nodeToUpdate.close) {
		let closeStart = (<vscode.Position>nodeToUpdate.close.start).translate(0, 2);
		let closeEnd = (<vscode.Position>nodeToUpdate.close.end).translate(0, -1);
		ranges.push(new vscode.Range(closeStart, closeEnd));
	}
	return ranges;
}


