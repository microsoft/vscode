/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, getNodeOuterSelection, getNodeInnerSelection, isStyleSheet } from './util';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';

export function balanceOut() {
	balance(true);
}

export function balanceIn() {
	balance(false);
}

function balance(out: boolean) {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	if (isStyleSheet(editor.document.languageId)) {
		return;
	}
	let getRangeFunction = out ? getRangeToBalanceOut : getRangeToBalanceIn;

	let rootNode: Node = parse(editor.document.getText());

	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		let range = getRangeFunction(editor.document, selection, rootNode);
		if (range) {
			newSelections.push(range);
		}
	});

	editor.selection = newSelections[0];
	editor.selections = newSelections;
}

function getRangeToBalanceOut(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): vscode.Selection {
	let offset = document.offsetAt(selection.start);
	let nodeToBalance = getNode(rootNode, offset);

	let innerSelection = getNodeInnerSelection(document, nodeToBalance);
	let outerSelection = getNodeOuterSelection(document, nodeToBalance);

	if (innerSelection.contains(selection) && !innerSelection.isEqual(selection)) {
		return innerSelection;
	}
	if (outerSelection.contains(selection) && !outerSelection.isEqual(selection)) {
		return outerSelection;
	}
	return;
}

function getRangeToBalanceIn(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): vscode.Selection {
	let offset = document.offsetAt(selection.start);
	let nodeToBalance: Node = getNode(rootNode, offset);

	if (!nodeToBalance.firstChild) {
		return selection;
	}

	if (nodeToBalance.firstChild.start === offset && nodeToBalance.firstChild.end === document.offsetAt(selection.end)) {
		return getNodeInnerSelection(document, nodeToBalance.firstChild);
	}

	return new vscode.Selection(document.positionAt(nodeToBalance.firstChild.start), document.positionAt(nodeToBalance.firstChild.end));

}

