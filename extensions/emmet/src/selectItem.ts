/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { validate, parse } from './util';
import { nextItemHTML, prevItemHTML } from './selectItemHTML';
import { nextItemStylesheet, prevItemStylesheet } from './selectItemStylesheet';
import { isStyleSheet } from 'vscode-emmet-helper';


export function fetchSelectItem(direction: string): void {
	let editor = vscode.window.activeTextEditor;
	if (!validate()) {
		return;
	}

	let nextItem;
	let prevItem;

	if (isStyleSheet(editor.document.languageId)) {
		nextItem = nextItemStylesheet;
		prevItem = prevItemStylesheet;
	} else {
		nextItem = nextItemHTML;
		prevItem = prevItemHTML;
	}

	let rootNode = parse(editor.document);
	if (!rootNode) {
		return;
	}

	let newSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		const selectionStart = selection.isReversed ? selection.active : selection.anchor;
		const selectionEnd = selection.isReversed ? selection.anchor : selection.active;

		let updatedSelection = direction === 'next' ? nextItem(selectionStart, selectionEnd, editor, rootNode) : prevItem(selectionStart, selectionEnd, editor, rootNode);
		newSelections.push(updatedSelection ? updatedSelection : selection);
	});
	editor.selections = newSelections;
	editor.revealRange(editor.selections[editor.selections.length - 1]);
}