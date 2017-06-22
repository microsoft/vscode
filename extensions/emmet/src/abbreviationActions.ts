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

		let textToReplaceList: [string, vscode.Range][] = [];
		let firstTextToReplace: string;
		let allTextToReplaceSame: boolean = true;

		editor.selections.forEach(selection => {
			let rangeToReplace: vscode.Range = selection;
			if (rangeToReplace.isEmpty) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
			}
			let textToReplace = editor.document.getText(rangeToReplace);

			if (!firstTextToReplace) {
				firstTextToReplace = textToReplace;
			} else if (allTextToReplaceSame && firstTextToReplace !== textToReplace) {
				allTextToReplaceSame = false;
			}

			textToReplaceList.push([textToReplace, rangeToReplace]);
		});

		if (textToReplaceList.length === 0) {
			return;
		}

		// Text to replace at multiple cursors are not the same
		// `editor.insertSnippet` will have to be called for each instance separately
		// We will not be able to maintain multiple cursors after snippet insertion
		if (!allTextToReplaceSame) {
			textToReplaceList.forEach(([textToReplace, rangeToReplace]) => {
				let expandedText = expand(abbr, getExpandOptions(syntax, textToReplace));
				if (expandedText) {
					editor.insertSnippet(new vscode.SnippetString(expandedText), rangeToReplace);
				}
			});
			return;
		}

		// Text to replace at all cursors are the same
		// We can pass all ranges to `editor.insertSnippet` in a single call so that 
		// all cursors are maintained after snippet insertion
		let expandedText = expand(abbr, getExpandOptions(syntax, textToReplaceList[0][0]));
		let allRanges = textToReplaceList.map(value => {
			return value[1];
		});
		if (expandedText) {
			editor.insertSnippet(new vscode.SnippetString(expandedText), allRanges);
		}

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

	let abbreviationList: [string, vscode.Range][] = [];
	let firstAbbreviation: string;
	let allAbbreviationsSame: boolean = true;

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

		if (!firstAbbreviation) {
			firstAbbreviation = abbreviation;
		} else if (allAbbreviationsSame && firstAbbreviation !== abbreviation) {
			allAbbreviationsSame = false;
		}

		abbreviationList.push([abbreviation, abbreviationRange]);
	});

	if (abbreviationList.length === 0) {
		return;
	}

	// Abbreviations at multiple cursors are not the same
	// `editor.insertSnippet` will have to be called for each abbreviation separately
	// We will not be able to maintain multiple cursors after snippet insertion
	if (!allAbbreviationsSame) {
		abbreviationList.forEach(([abbreviation, abbreviationRange]) => {
			let expandedText = expand(abbreviation, getExpandOptions(syntax));
			if (expandedText) {
				editor.insertSnippet(new vscode.SnippetString(expandedText), abbreviationRange);
			}
		});
		return;
	}

	// Abbreviations at all cursors are the same
	// We can pass all ranges to `editor.insertSnippet` in a single call so that 
	// all cursors are maintained after snippet insertion
	let expandedText = expand(abbreviationList[0][0], getExpandOptions(syntax));
	let allRanges = abbreviationList.map(value => {
		return value[1];
	});
	if (expandedText) {
		editor.insertSnippet(new vscode.SnippetString(expandedText), allRanges);
	}


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