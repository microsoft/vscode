/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { toLSTextDocument, validate, getHtmlNodeLS, offsetRangeToSelection } from './util';
import { TextDocument as LSTextDocument } from 'vscode-html-languageservice';

export function matchTag() {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}

	const editor = vscode.window.activeTextEditor;
	const document = toLSTextDocument(editor.document);

	let updatedSelections: vscode.Selection[] = [];
	editor.selections.forEach(selection => {
		const updatedSelection = getUpdatedSelections(document, selection.start);
		if (updatedSelection) {
			updatedSelections.push(updatedSelection);
		}
	});
	if (updatedSelections.length) {
		editor.selections = updatedSelections;
		editor.revealRange(editor.selections[updatedSelections.length - 1]);
	}
}

function getUpdatedSelections(document: LSTextDocument, position: vscode.Position): vscode.Selection | undefined {
	const currentNode = getHtmlNodeLS(document, position, true);
	if (!currentNode) {
		return;
	}

	const offset = document.offsetAt(position);

	// If no closing tag or cursor is between open and close tag, then no-op
	if (!currentNode?.endTagStart
		|| !currentNode?.startTagEnd
		|| (offset > currentNode.startTagEnd && offset < currentNode.endTagStart)) {
		return;
	}

	// Place cursor inside the close tag if cursor is inside the open tag, else place it inside the open tag
	const finalOffset = (offset <= currentNode.startTagEnd) ? currentNode.endTagStart + 2 : currentNode.start + 1;
	return offsetRangeToSelection(document, finalOffset, finalOffset);
}
