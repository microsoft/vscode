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
import { getExpandOptions, extractAbbreviation, isStyleSheet, isAbbreviationValid } from 'vscode-emmet-helper';
import { DocumentStreamReader } from './bufferStream';

interface ExpandAbbreviationInput {
	syntax: string;
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
		if (!abbreviation || !abbreviation.trim() || !isAbbreviationValid(syntax, abbreviation)) { return; }

		let expandAbbrList: ExpandAbbreviationInput[] = [];
		let firstTextToReplace: string;
		let allTextToReplaceSame: boolean = true;
		let preceedingWhiteSpace = '';

		editor.selections.forEach(selection => {
			let rangeToReplace: vscode.Range = selection.isReversed ? new vscode.Range(selection.active, selection.anchor) : selection;
			if (rangeToReplace.isEmpty) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
			}
			const firstLine = editor.document.lineAt(rangeToReplace.start).text;
			const matches = firstLine.match(/^(\s*)/);
			if (matches) {
				preceedingWhiteSpace = matches[1];
			}
			if (rangeToReplace.start.character <= preceedingWhiteSpace.length) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.end.line, rangeToReplace.end.character);
			}

			let textToWrap = newLine;
			for (let i = rangeToReplace.start.line; i <= rangeToReplace.end.line; i++) {
				textToWrap += '\t' + editor.document.lineAt(i).text.substr(preceedingWhiteSpace.length) + newLine;
			}

			if (!firstTextToReplace) {
				firstTextToReplace = textToWrap;
			} else if (allTextToReplaceSame && firstTextToReplace !== textToWrap) {
				allTextToReplaceSame = false;
			}

			expandAbbrList.push({ syntax, abbreviation, rangeToReplace, textToWrap });
		});

		expandAbbreviationInRange(editor, expandAbbrList, syntax, allTextToReplaceSame, preceedingWhiteSpace);
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
		if (!isAbbreviationValid(syntax, abbreviation)) {
			return;
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

		abbreviationList.push({ syntax, abbreviation, rangeToReplace });
	});

	expandAbbreviationInRange(editor, abbreviationList, syntax, allAbbreviationsSame);
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

/**
 * Expands abbreviations as detailed in expandAbbrList in the editor
 * @param editor 
 * @param expandAbbrList 
 * @param syntax 
 * @param insertSameSnippet 
 * @param preceedingWhiteSpace 
 */
function expandAbbreviationInRange(editor: vscode.TextEditor, expandAbbrList: ExpandAbbreviationInput[], syntax: string, insertSameSnippet: boolean, preceedingWhiteSpace: string = '') {
	if (!expandAbbrList || expandAbbrList.length === 0) {
		return;
	}
	const newLine = editor.document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';

	// Snippet to replace at multiple cursors are not the same
	// `editor.insertSnippet` will have to be called for each instance separately
	// We will not be able to maintain multiple cursors after snippet insertion
	if (!insertSameSnippet) {
		expandAbbrList.forEach((expandAbbrInput: ExpandAbbreviationInput) => {
			let expandedText = expandAbbr(expandAbbrInput, preceedingWhiteSpace, newLine);
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
	let expandedText = expandAbbr(anyExpandAbbrInput, preceedingWhiteSpace, newLine);
	let allRanges = expandAbbrList.map(value => {
		return value.rangeToReplace;
	});
	if (expandedText) {
		editor.insertSnippet(new vscode.SnippetString(expandedText), allRanges);
	}
}

/**
 * Expands abbreviation as detailed in given input. 
 * If there is textToWrap, then given preceedingWhiteSpace is applied
 */
function expandAbbr(input: ExpandAbbreviationInput, preceedingWhiteSpace: string, newLine: string): string {

	let expandedText = expand(input.abbreviation, getExpandOptions(input.syntax, input.textToWrap));
	if (!expandedText) {
		return;
	}

	if (!input.textToWrap) {
		return expandedText;
	}

	return expandedText.split(newLine).map(line => preceedingWhiteSpace + line).join(newLine);
}