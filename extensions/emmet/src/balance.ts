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

	let rootNode: Node = parse(new DocumentStreamReader(editor.document));

	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		let range = getRangeFunction(editor.document, selection, rootNode);
		newSelections.push(range ? range : selection);
	});

	editor.selection = newSelections[0];
	editor.selections = newSelections;
}

function getRangeToBalanceOut(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): vscode.Selection {
	let nodeToBalance = getNode(rootNode, selection.start);
	if (!nodeToBalance) {
		return;
	}
	if (!nodeToBalance.close) {
		return new vscode.Selection(nodeToBalance.start, nodeToBalance.end);
	}

	let innerSelection = new vscode.Selection(nodeToBalance.open.end, nodeToBalance.close.start);
	let outerSelection = new vscode.Selection(nodeToBalance.start, nodeToBalance.end);

	if (innerSelection.contains(selection) && !innerSelection.isEqual(selection)) {
		return innerSelection;
	}
	if (outerSelection.contains(selection) && !outerSelection.isEqual(selection)) {
		return outerSelection;
	}
	return;
}

function getRangeToBalanceIn(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): vscode.Selection {
	let nodeToBalance: Node = getNode(rootNode, selection.start, true);

	if (!nodeToBalance) {
		return;
	}

	if (!nodeToBalance.firstChild) {
		if (nodeToBalance.close) {
			return new vscode.Selection(nodeToBalance.open.end, nodeToBalance.close.start);
		}
		return;
	}

	if (selection.start.isEqual(nodeToBalance.firstChild.start)
		&& selection.end.isEqual(nodeToBalance.firstChild.end)
		&& nodeToBalance.firstChild.close) {
		return new vscode.Selection(nodeToBalance.firstChild.open.end, nodeToBalance.firstChild.close.start);
	}

	return new vscode.Selection(nodeToBalance.firstChild.start, nodeToBalance.firstChild.end);

}

