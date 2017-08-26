/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HtmlNode } from 'EmmetNode';
import { getNode, parseDocument, validate } from './util';

export function balanceOut() {
	balance(true);
}

export function balanceIn() {
	balance(false);
}

function balance(out: boolean) {
	let editor = vscode.window.activeTextEditor;
	if (!validate(false)) {
		return;
	}

	let rootNode = <HtmlNode>parseDocument(editor.document);
	if (!rootNode) {
		return;
	}

	let getRangeFunction = out ? getRangeToBalanceOut : getRangeToBalanceIn;
	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		let range = getRangeFunction(editor.document, selection, rootNode);
		newSelections.push(range ? range : selection);
	});

	editor.selection = newSelections[0];
	editor.selections = newSelections;
}

function getRangeToBalanceOut(document: vscode.TextDocument, selection: vscode.Selection, rootNode: HtmlNode): vscode.Selection {
	let nodeToBalance = <HtmlNode>getNode(rootNode, selection.start);
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

function getRangeToBalanceIn(document: vscode.TextDocument, selection: vscode.Selection, rootNode: HtmlNode): vscode.Selection {
	let nodeToBalance = <HtmlNode>getNode(rootNode, selection.start, true);
	if (!nodeToBalance) {
		return;
	}

	if (selection.start.isEqual(nodeToBalance.start)
		&& selection.end.isEqual(nodeToBalance.end)
		&& nodeToBalance.close) {
		return new vscode.Selection(nodeToBalance.open.end, nodeToBalance.close.start);
	}

	if (!nodeToBalance.firstChild) {
		return;
	}

	if (selection.start.isEqual(nodeToBalance.firstChild.start)
		&& selection.end.isEqual(nodeToBalance.firstChild.end)
		&& nodeToBalance.firstChild.close) {
		return new vscode.Selection(nodeToBalance.firstChild.open.end, nodeToBalance.firstChild.close.start);
	}

	return new vscode.Selection(nodeToBalance.firstChild.start, nodeToBalance.firstChild.end);

}

