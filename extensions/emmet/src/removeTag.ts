/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { parseDocument, validate, getHtmlNode } from './util';
import { HtmlNode } from 'EmmetNode';

export function removeTag() {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}
	const editor = vscode.window.activeTextEditor;

	let rootNode = <HtmlNode>parseDocument(editor.document);
	if (!rootNode) {
		return;
	}

	let indentInSpaces = '';
	const tabSize: number = editor.options.tabSize ? +editor.options.tabSize : 0;
	for (let i = 0; i < tabSize || 0; i++) {
		indentInSpaces += ' ';
	}

	let rangesToRemove: vscode.Range[] = [];
	editor.selections.reverse().forEach(selection => {
		rangesToRemove = rangesToRemove.concat(getRangeToRemove(editor, rootNode, selection, indentInSpaces));
	});

	return editor.edit(editBuilder => {
		rangesToRemove.forEach(range => {
			editBuilder.replace(range, '');
		});
	});
}

function getRangeToRemove(editor: vscode.TextEditor, rootNode: HtmlNode, selection: vscode.Selection, indentInSpaces: string): vscode.Range[] {

	let nodeToUpdate = getHtmlNode(editor.document, rootNode, selection.start, true);
	if (!nodeToUpdate) {
		return [];
	}

	let openRange = new vscode.Range(nodeToUpdate.open.start, nodeToUpdate.open.end);
	let closeRange: vscode.Range | null = null;
	if (nodeToUpdate.close) {
		closeRange = new vscode.Range(nodeToUpdate.close.start, nodeToUpdate.close.end);
	}

	let ranges = [openRange];
	if (closeRange) {
		const indentAdjustAmount: number = getAdjustedIndentAmount(editor, openRange, indentInSpaces);
		for (let i = openRange.start.line + 1; i <= closeRange.start.line && indentAdjustAmount !== 0; i++) {
			let lineContent = editor.document.lineAt(i).text;
			if (lineContent.startsWith('\t'.repeat(indentAdjustAmount))) {
				ranges.push(new vscode.Range(i, 0, i, indentAdjustAmount));
			} else if (lineContent.startsWith(indentInSpaces.repeat(indentAdjustAmount))) {
				ranges.push(new vscode.Range(i, 0, i, indentInSpaces.length*indentAdjustAmount));
			}
		}
		ranges.push(closeRange);
	}
	return ranges;
}

function getAdjustedIndentAmount(editor: vscode.TextEditor ,openRange: vscode.Range, indentInSpaces: string): number {
	const startLineContent: string = editor.document.lineAt(openRange.end.line).text;
	// If there is some content in the same line as opening tag, then don't adjust indentation.
	if(startLineContent.length !== openRange.end.character) {
		return 0;
	}
	const nextLineContent: string = editor.document.lineAt(openRange.end.line+1).text;

	return Math.max(0, findRelativeIndent(nextLineContent, startLineContent, indentInSpaces));
}

function findRelativeIndent(nextLineContent: string, startLineContent: string, indentInSpaces: string) : number {
	return findIndent(nextLineContent, indentInSpaces) - findIndent(startLineContent, indentInSpaces);
}

// Finds out how many tabs or tab-spaces at the begining.
function findIndent(line: string, indentInSpaces: string): number {
	let currentIndent: number = 0;
	while(line.substring(indentInSpaces.length*currentIndent).startsWith(indentInSpaces) || line.substring(currentIndent).startsWith('\t')) {
		currentIndent++;
	}
	return currentIndent;
}
