/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HtmlNode } from 'EmmetNode';
import { getNode, parse, validate } from './util';

export function updateTag(tagName: string) {
	let editor = vscode.window.activeTextEditor;
	if (!validate(false)) {
		return;
	}
	let rootNode = <HtmlNode>parse(editor.document);
	if (!rootNode) {
		return;
	}

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

function getRangesToUpdate(editor: vscode.TextEditor, selection: vscode.Selection, rootNode: HtmlNode): vscode.Range[] {
	let nodeToUpdate = <HtmlNode>getNode(rootNode, selection.start);
	if (!nodeToUpdate) {
		return [];
	}

	let openStart = nodeToUpdate.open.start.translate(0, 1);
	let openEnd = openStart.translate(0, nodeToUpdate.name.length);

	let ranges = [new vscode.Range(openStart, openEnd)];
	if (nodeToUpdate.close) {
		let closeStart = nodeToUpdate.close.start.translate(0, 2);
		let closeEnd = nodeToUpdate.close.end.translate(0, -1);
		ranges.push(new vscode.Range(closeStart, closeEnd));
	}
	return ranges;
}


