/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { validate } from './util';
import { nextItemHTML, prevItemHTML } from './selectItemHTML';
import { nextItemStylesheet, prevItemStylesheet } from './selectItemStylesheet';
import parseStylesheet from '@emmetio/css-parser';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { DocumentStreamReader } from './bufferStream';
import { isStyleSheet } from 'vscode-emmet-helper';


export function fetchSelectItem(direction: string): void {
	let editor = vscode.window.activeTextEditor;
	if (!validate()) {
		return;
	}

	let nextItem;
	let prevItem;
	let parseContent;

	if (isStyleSheet(editor.document.languageId)) {
		nextItem = nextItemStylesheet;
		prevItem = prevItemStylesheet;
		parseContent = parseStylesheet;
	} else {
		nextItem = nextItemHTML;
		prevItem = prevItemHTML;
		parseContent = parse;
	}

	let rootNode: Node = parseContent(new DocumentStreamReader(editor.document));
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