/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { validate, getEmmetMode, getEmmetConfiguration, getHtmlFlatNode, offsetRangeToVsRange } from './util';
import { HtmlNode as HtmlFlatNode } from 'EmmetFlatNode';
import { getRootNode } from './parseDocument';

export function splitJoinTag() {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}

	const editor = vscode.window.activeTextEditor;
	const document = editor.document;
	const rootNode = <HtmlFlatNode>getRootNode(editor.document, true);
	if (!rootNode) {
		return;
	}

	return editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			const documentText = document.getText();
			const offset = document.offsetAt(selection.start);
			const nodeToUpdate = getHtmlFlatNode(documentText, rootNode, offset, true);
			if (nodeToUpdate) {
				const textEdit = getRangesToReplace(document, nodeToUpdate);
				editBuilder.replace(textEdit.range, textEdit.newText);
			}
		});
	});
}

function getRangesToReplace(document: vscode.TextDocument, nodeToUpdate: HtmlFlatNode): vscode.TextEdit {
	let rangeToReplace: vscode.Range;
	let textToReplaceWith: string;

	if (!nodeToUpdate.open || !nodeToUpdate.close) {
		// Split Tag
		const nodeText = document.getText().substring(nodeToUpdate.start, nodeToUpdate.end);
		const m = nodeText.match(/(\s*\/)?>$/);
		const end = nodeToUpdate.end;
		const start = m ? end - m[0].length : end;

		rangeToReplace = offsetRangeToVsRange(document, start, end);
		textToReplaceWith = `></${nodeToUpdate.name}>`;
	} else {
		// Join Tag
		const start = nodeToUpdate.open.end - 1;
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
