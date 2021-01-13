/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getHtmlFlatNode, offsetRangeToSelection, validate } from './util';
import { getRootNode } from './parseDocument';
import { HtmlNode as HtmlFlatNode } from 'EmmetFlatNode';

let balanceOutStack: Array<vscode.Selection[]> = [];
let lastBalancedSelections: vscode.Selection[] = [];

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
	const document = editor.document;
	const rootNode = <HtmlFlatNode>getRootNode(document, true);
	if (!rootNode) {
		return;
	}

	const rangeFn = out ? getRangeToBalanceOut : getRangeToBalanceIn;
	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		const range = rangeFn(document, rootNode, selection);
		newSelections.push(range);
	});

	// check whether we are starting a balance elsewhere
	if (areSameSelections(lastBalancedSelections, editor.selections)) {
		// we are not starting elsewhere, so use the stack as-is
		if (out) {
			// make sure we are able to expand outwards
			if (!areSameSelections(editor.selections, newSelections)) {
				balanceOutStack.push(editor.selections);
			}
		} else if (balanceOutStack.length) {
			newSelections = balanceOutStack.pop()!;
		}
	} else {
		// we are starting elsewhere, so reset the stack
		balanceOutStack = out ? [editor.selections] : [];
	}

	editor.selections = newSelections;
	lastBalancedSelections = editor.selections;
}

function getRangeToBalanceOut(document: vscode.TextDocument, rootNode: HtmlFlatNode, selection: vscode.Selection): vscode.Selection {
	const offset = document.offsetAt(selection.start);
	const nodeToBalance = getHtmlFlatNode(document.getText(), rootNode, offset, false);
	if (!nodeToBalance) {
		return selection;
	}
	if (!nodeToBalance.open || !nodeToBalance.close) {
		return offsetRangeToSelection(document, nodeToBalance.start, nodeToBalance.end);
	}

	const innerSelection = offsetRangeToSelection(document, nodeToBalance.open.end, nodeToBalance.close.start);
	const outerSelection = offsetRangeToSelection(document, nodeToBalance.open.start, nodeToBalance.close.end);

	if (innerSelection.contains(selection) && !innerSelection.isEqual(selection)) {
		return innerSelection;
	}
	if (outerSelection.contains(selection) && !outerSelection.isEqual(selection)) {
		return outerSelection;
	}
	return selection;
}

function getRangeToBalanceIn(document: vscode.TextDocument, rootNode: HtmlFlatNode, selection: vscode.Selection): vscode.Selection {
	const offset = document.offsetAt(selection.start);
	const nodeToBalance = getHtmlFlatNode(document.getText(), rootNode, offset, true);
	if (!nodeToBalance) {
		return selection;
	}

	const selectionStart = document.offsetAt(selection.start);
	const selectionEnd = document.offsetAt(selection.end);
	if (nodeToBalance.open && nodeToBalance.close) {
		const entireNodeSelected = selectionStart === nodeToBalance.start && selectionEnd === nodeToBalance.end;
		const startInOpenTag = selectionStart > nodeToBalance.open.start && selectionStart < nodeToBalance.open.end;
		const startInCloseTag = selectionStart > nodeToBalance.close.start && selectionStart < nodeToBalance.close.end;

		if (entireNodeSelected || startInOpenTag || startInCloseTag) {
			return offsetRangeToSelection(document, nodeToBalance.open.end, nodeToBalance.close.start);
		}
	}

	if (!nodeToBalance.firstChild) {
		return selection;
	}

	const firstChild = nodeToBalance.firstChild;
	if (selectionStart === firstChild.start
		&& selectionEnd === firstChild.end
		&& firstChild.open
		&& firstChild.close) {
		return offsetRangeToSelection(document, firstChild.open.end, firstChild.close.start);
	}

	return offsetRangeToSelection(document, firstChild.start, firstChild.end);
}

function areSameSelections(a: vscode.Selection[], b: vscode.Selection[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (!a[i].isEqual(b[i])) {
			return false;
		}
	}
	return true;
}
