/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getHtmlNodeLS, offsetRangeToSelection, toLSTextDocument, validate } from './util';
import { parseHTMLDocument } from './parseDocument';
import { TextDocument as LSTextDocument } from 'vscode-html-languageservice';

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
	const document = toLSTextDocument(editor.document);
	const htmlDocument = parseHTMLDocument(document);
	if (!htmlDocument) {
		return;
	}

	const rangeFn = out ? getRangeToBalanceOut : getRangeToBalanceIn;
	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		const range = rangeFn(document, selection);
		newSelections.push(range);
	});

	// check whether we are starting a balance elsewhere
	if (areSameSelections(lastBalancedSelections, editor.selections)) {
		// we are not starting elsewhere, so use the stack as-is
		if (out) {
			balanceOutStack.push(editor.selections);
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

function getRangeToBalanceOut(document: LSTextDocument, selection: vscode.Selection): vscode.Selection {
	const nodeToBalance = getHtmlNodeLS(document, selection.start, false);
	if (!nodeToBalance) {
		return selection;
	}
	if (!nodeToBalance.endTagStart || !nodeToBalance.startTagEnd) {
		return offsetRangeToSelection(document, nodeToBalance.start, nodeToBalance.end);
	}

	const innerSelection = offsetRangeToSelection(document, nodeToBalance.startTagEnd, nodeToBalance.endTagStart);
	const outerSelection = offsetRangeToSelection(document, nodeToBalance.start, nodeToBalance.end);

	if (innerSelection.contains(selection) && !innerSelection.isEqual(selection)) {
		return innerSelection;
	}
	if (outerSelection.contains(selection) && !outerSelection.isEqual(selection)) {
		return outerSelection;
	}
	return selection;
}

function getRangeToBalanceIn(document: LSTextDocument, selection: vscode.Selection): vscode.Selection {
	const nodeToBalance = getHtmlNodeLS(document, selection.start, true);
	if (!nodeToBalance) {
		return selection;
	}

	const selectionStart = document.offsetAt(selection.start);
	const selectionEnd = document.offsetAt(selection.end);
	if (nodeToBalance.endTagStart && nodeToBalance.startTagEnd) {
		const entireNodeSelected = selectionStart === nodeToBalance.start && selectionEnd === nodeToBalance.end;
		const startInOpenTag = selectionStart > nodeToBalance.start && selectionStart < nodeToBalance.startTagEnd;
		const startInCloseTag = selectionStart > nodeToBalance.endTagStart && selectionStart < nodeToBalance.end;

		if (entireNodeSelected || startInOpenTag || startInCloseTag) {
			return offsetRangeToSelection(document, nodeToBalance.startTagEnd, nodeToBalance.endTagStart);
		}
	}

	if (!nodeToBalance.children.length) {
		return selection;
	}

	const firstChild = nodeToBalance.children[0];
	if (selectionStart === firstChild.start
		&& selectionEnd === firstChild.end
		&& firstChild.endTagStart
		&& firstChild.startTagEnd) {
		return offsetRangeToSelection(document, firstChild.startTagEnd, firstChild.endTagStart);
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
