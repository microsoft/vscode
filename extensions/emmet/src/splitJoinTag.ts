/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { validate, getEmmetMode, getEmmetConfiguration, toLSTextDocument, getHtmlNodeLS, offsetRangeToVsRange } from './util';
import { Node as LSNode, TextDocument as LSTextDocument } from 'vscode-html-languageservice';

export function splitJoinTag() {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}

	const editor = vscode.window.activeTextEditor;
	const document = toLSTextDocument(editor.document);
	return editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			const nodeToUpdate = getHtmlNodeLS(document, selection.start, true);
			if (nodeToUpdate) {
				const textEdit = getRangesToReplace(document, nodeToUpdate);
				if (textEdit) {
					editBuilder.replace(textEdit.range, textEdit.newText);
				}
			}
		});
	});
}

function getRangesToReplace(document: LSTextDocument, nodeToUpdate: LSNode): vscode.TextEdit | undefined {
	let rangeToReplace: vscode.Range;
	let textToReplaceWith: string;

	if (!nodeToUpdate?.tag) {
		return;
	}

	if (!nodeToUpdate.endTagStart || !nodeToUpdate.startTagEnd) {
		// Split Tag
		const nodeText = document.getText().substring(nodeToUpdate.start, nodeToUpdate.end);
		const m = nodeText.match(/(\s*\/)?>$/);
		const end = nodeToUpdate.end;
		const start = m ? end - m[0].length : end;

		rangeToReplace = offsetRangeToVsRange(document, start, end);
		textToReplaceWith = `></${nodeToUpdate.tag}>`;
	} else {
		// Join Tag
		const start = nodeToUpdate.startTagEnd - 1;
		const end = nodeToUpdate.end;
		rangeToReplace = offsetRangeToVsRange(document, start, end);
		textToReplaceWith = '/>';

		const emmetMode = getEmmetMode(document.languageId, []) || '';
		const emmetConfig = getEmmetConfiguration(emmetMode);
		if (emmetMode && emmetConfig.syntaxProfiles[emmetMode] &&
			(emmetConfig.syntaxProfiles[emmetMode]['selfClosingStyle'] === 'xhtml' || emmetConfig.syntaxProfiles[emmetMode]['self_closing_tag'] === 'xhtml')) {
			textToReplaceWith = ' ' + textToReplaceWith;
		}
	}

	return new vscode.TextEdit(rangeToReplace, textToReplaceWith);
}
