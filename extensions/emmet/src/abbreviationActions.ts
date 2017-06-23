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

interface ExpandAbbreviationInput {
	abbreviation: string;
	rangeToReplace: vscode.Range;
	textToWrap?: string;
}

export function wrapWithAbbreviation() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	const newLine = editor.document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';
	let syntax = getSyntax(editor.document);

	vscode.window.showInputBox({ prompt: 'Enter Abbreviation' }).then(abbreviation => {
		if (!abbreviation || !abbreviation.trim()) { return; }

		let expandAbbrList: ExpandAbbreviationInput[] = [];
		let firstTextToReplace: string;
		let allTextToReplaceSame: boolean = true;

		editor.selections.forEach(selection => {
			let rangeToReplace: vscode.Range = selection;
			if (rangeToReplace.isEmpty) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
			}
			let textToWrap = newLine + editor.document.getText(rangeToReplace) + newLine;

			if (!firstTextToReplace) {
				firstTextToReplace = textToWrap;
			} else if (allTextToReplaceSame && firstTextToReplace !== textToWrap) {
				allTextToReplaceSame = false;
			}

			expandAbbrList.push({ abbreviation, rangeToReplace, textToWrap });
		});

		expandAbbr(editor, expandAbbrList, syntax, allTextToReplaceSame);
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

	let abbreviationList: ExpandAbbreviationInput[] = [];
	let firstAbbreviation: string;
	let allAbbreviationsSame: boolean = true;

	editor.selections.forEach(selection => {
		let rangeToReplace: vscode.Range = selection;
		let position = selection.isReversed ? selection.anchor : selection.active;
		let abbreviation = editor.document.getText(rangeToReplace);
		if (rangeToReplace.isEmpty) {
			[rangeToReplace, abbreviation] = extractAbbreviation(editor.document, position);
		}

		let currentNode = getNode(rootNode, position);
		if (!isValidLocationForEmmetAbbreviation(currentNode, syntax, position)) {
			return;
		}

		if (!firstAbbreviation) {
			firstAbbreviation = abbreviation;
		} else if (allAbbreviationsSame && firstAbbreviation !== abbreviation) {
			allAbbreviationsSame = false;
		}

		abbreviationList.push({ abbreviation, rangeToReplace });
	});

	expandAbbr(editor, abbreviationList, syntax, allAbbreviationsSame);
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

function expandAbbr(editor: vscode.TextEditor, expandAbbrList: ExpandAbbreviationInput[], syntax: string, insertSameSnippet: boolean) {
	if (!expandAbbrList || expandAbbrList.length === 0) {
		return;
	}

	// Snippet to replace at multiple cursors are not the same
	// `editor.insertSnippet` will have to be called for each instance separately
	// We will not be able to maintain multiple cursors after snippet insertion
	if (!insertSameSnippet) {
		expandAbbrList.forEach((expandAbbrInput: ExpandAbbreviationInput) => {
			let expandedText = expand(expandAbbrInput.abbreviation, getExpandOptions(syntax, expandAbbrInput.textToWrap));
			if (expandedText) {
				editor.insertSnippet(new vscode.SnippetString(expandedText), expandAbbrInput.rangeToReplace);
			}
		});
		return;
	}

	// Snippet to replace at all cursors are the same
	// We can pass all ranges to `editor.insertSnippet` in a single call so that 
	// all cursors are maintained after snippet insertion
	const anyExpandAbbrInput = expandAbbrList[0];
	let expandedText = expand(anyExpandAbbrInput.abbreviation, getExpandOptions(syntax, anyExpandAbbrInput.textToWrap));
	let allRanges = expandAbbrList.map(value => {
		return value.rangeToReplace;
	});
	if (expandedText) {
		editor.insertSnippet(new vscode.SnippetString(expandedText), allRanges);
	}
}