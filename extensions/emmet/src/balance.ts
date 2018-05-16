/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HtmlNode } from 'EmmetNode';
import { getNode, parseDocument, validate } from './util';

let balanceStack: Array<vscode.Selection[]> = [];
let beforeEmmetSelection: vscode.Selection[];
let lastOut = false;

export function balanceOut() {
	balance(true);
}

export function balanceIn() {
	balance(false);
}

function balance(out: boolean) {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}
	const editor = vscode.window.activeTextEditor;
	let rootNode = <HtmlNode>parseDocument(editor.document);
	if (!rootNode) {
		return;
	}

	if(out) {
		if(balanceStack.length === 0) {
			beforeEmmetSelection = editor.selections;
		}

		let newSelections: vscode.Selection[] = [];
		editor.selections.forEach(selection => {
			let range = getRangeToBalanceOut(editor.document, selection, rootNode);
			newSelections.push(range);
		});

		editor.selections = newSelections;
		balanceStack.push(newSelections);
		lastOut = true;
	} else {
		if(lastOut) {
			balanceStack.pop();
			lastOut = false;
		}
		let oldSelections = balanceStack.pop() || beforeEmmetSelection;
		editor.selections = oldSelections;
	}
}

function getRangeToBalanceOut(document: vscode.TextDocument, selection: vscode.Selection, rootNode: HtmlNode): vscode.Selection {
	let nodeToBalance = <HtmlNode>getNode(rootNode, selection.start);
	if (!nodeToBalance) {
		return selection;
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
	return selection;
}
