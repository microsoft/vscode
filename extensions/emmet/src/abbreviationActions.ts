/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { expand } from '@emmetio/expand-abbreviation';
import parseStylesheet from '@emmetio/css-parser';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { getSyntax, getNode, getInnerRange } from './util';
import { getExpandOptions, extractAbbreviation, isStyleSheet } from 'vscode-emmet-helper';
import { DocumentStreamReader } from './bufferStream';

export function wrapWithAbbreviation() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	let syntax = getSyntax(editor.document);

	vscode.window.showInputBox({ prompt: 'Enter Abbreviation' }).then(abbr => {
		if (!abbr || !abbr.trim()) { return; }
		editor.selections.forEach(selection => {
			let rangeToReplace: vscode.Range = selection;
			if (rangeToReplace.isEmpty) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
			}
			let textToReplace = editor.document.getText(rangeToReplace);
			let expandedText = expand(abbr, getExpandOptions(syntax, textToReplace));
			editor.insertSnippet(new vscode.SnippetString(expandedText), rangeToReplace);
		});
	});
}

export function expandAbbreviation(args) {

	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	if (typeof args !== 'object' || !args['syntax']) {
		return;
	}
	let syntax = args['syntax'];
	let parseContent = isStyleSheet(syntax) ? parseStylesheet : parse;
	let rootNode: Node = parseContent(new DocumentStreamReader(editor.document));

	editor.selections.forEach(selection => {
		let abbreviationRange: vscode.Range = selection;
		let position = selection.isReversed ? selection.anchor : selection.active;
		let abbreviation = editor.document.getText(abbreviationRange);
		if (abbreviationRange.isEmpty) {
			[abbreviationRange, abbreviation] = extractAbbreviation(editor.document, position);
		}

		let currentNode = getNode(rootNode, position);
		if (!isValidLocationForEmmetAbbreviation(currentNode, syntax, position)) {
			return;
		}

		let expandedText = expand(abbreviation, getExpandOptions(syntax));
		if (expandedText) {
			editor.insertSnippet(new vscode.SnippetString(expandedText), abbreviationRange);
		}
	});
}


/**
 * Checks if given position is a valid location to expand emmet abbreviation.
 * Works only on html and css/less/scss syntax
 * @param currentNode parsed node at given position
 * @param syntax syntax of the abbreviation
 * @param position position to validate
 */
export function isValidLocationForEmmetAbbreviation(currentNode: Node, syntax: string, position: vscode.Position): boolean {
	if (!currentNode) {
		return true;
	}

	if (isStyleSheet(syntax)) {
		return currentNode.type !== 'rule'
			|| (currentNode.selectorToken && position.isAfter(currentNode.selectorToken.end));
	}

	if (currentNode.close) {
		return getInnerRange(currentNode).contains(position);
	}

	return false;
}