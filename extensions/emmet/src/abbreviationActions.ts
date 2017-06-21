/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { expand } from '@emmetio/expand-abbreviation';
import * as extract from '@emmetio/extract-abbreviation';
import parseStylesheet from '@emmetio/css-parser';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';

import { getSyntax, getProfile, getVariables, isStyleSheet, getNode, getInnerRange, getMappedModes } from './util';
import { DocumentStreamReader } from './bufferStream';

const field = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

export function wrapWithAbbreviation() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	let rangeToReplace: vscode.Range = editor.selection;
	if (rangeToReplace.isEmpty) {
		rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
	}
	let textToReplace = editor.document.getText(rangeToReplace);
	let syntax = getSyntax(editor.document);

	vscode.window.showInputBox({ prompt: 'Enter Abbreviation' }).then(abbr => {
		if (!abbr || !abbr.trim()) { return; }
		let expandedText = expand(abbr, getExpandOptions(syntax, textToReplace));
		editor.insertSnippet(new vscode.SnippetString(expandedText), rangeToReplace);
	});
}

export function expandAbbreviation() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	let syntax = getSyntax(editor.document);
	let mappedSyntax = getMappedModes()[syntax];

	if (!mappedSyntax) {
		syntax = syntaxHelper(syntax, editor.document, editor.selection.end);
	} else {
		syntax = mappedSyntax;
	}
	if (!syntax) {
		return;
	}
	let output = expandAbbreviationHelper(syntax, editor.document, editor.selection);
	if (output) {
		editor.insertSnippet(new vscode.SnippetString(output.expandedText), output.abbreviationRange);
	}
}

export interface ExpandAbbreviationHelperOutput {
	expandedText: string;
	abbreviationRange: vscode.Range;
	abbreviation: string;
	syntax: string;
}

/**
 * Expands abbreviation at given range in the given document
 * @param syntax string syntax to be used for expanding abbreviations
 * @param document vscode.TextDocument
 * @param abbreviationRange vscode.Range range of the abbreviation that needs to be expanded
 * */
export function expandAbbreviationHelper(syntax: string, document: vscode.TextDocument, abbreviationRange: vscode.Range): ExpandAbbreviationHelperOutput {
	let abbreviation = document.getText(abbreviationRange);
	if (abbreviationRange.isEmpty) {
		[abbreviationRange, abbreviation] = extractAbbreviation(document, abbreviationRange.start);
	}

	let expandedText = expand(abbreviation, getExpandOptions(syntax));
	return { expandedText, abbreviationRange, abbreviation, syntax };
}

/**
 * Checks whether given position is valid for emmet abbreviation and returns appropriate syntax
 * @param syntax string language mode of current document
 * @param document vscode.Textdocument
 * @param position vscode.Position position of the abbreviation that needs to be expanded
 */
export function syntaxHelper(syntax: string, document: vscode.TextDocument, position: vscode.Position): string {
	let parseContent = isStyleSheet(syntax) ? parseStylesheet : parse;
	let rootNode: Node = parseContent(new DocumentStreamReader(document));
	let currentNode = getNode(rootNode, position);

	if (forceCssSyntax(syntax, currentNode, position)) {
		return 'css';
	} else if (!isValidLocationForEmmetAbbreviation(currentNode, syntax, position)) {
		return;
	}
}

/**
 * Extracts abbreviation from the given position in the given document
 */
function extractAbbreviation(document: vscode.TextDocument, position: vscode.Position): [vscode.Range, string] {
	let currentLine = document.lineAt(position.line).text;
	let result = extract(currentLine, position.character, true);
	if (!result) {
		return [null, ''];
	}

	let rangeToReplace = new vscode.Range(position.line, result.location, position.line, result.location + result.abbreviation.length);
	return [rangeToReplace, result.abbreviation];
}

/**
 * Inside <style> tag, force use of css abbreviations
 */
function forceCssSyntax(syntax: string, currentNode: Node, position: vscode.Position): boolean {
	return !isStyleSheet(syntax)
		&& currentNode
		&& currentNode.close
		&& currentNode.name === 'style'
		&& getInnerRange(currentNode).contains(position);
}

/**
 * Checks if given position is a valid location to expand emmet abbreviation
 * @param currentNode parsed node at given position
 * @param syntax syntax of the abbreviation
 * @param position position to validate
 */
function isValidLocationForEmmetAbbreviation(currentNode: Node, syntax: string, position: vscode.Position): boolean {
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

export function getExpandOptions(syntax: string, textToReplace?: string) {
	return {
		field: field,
		syntax: syntax,
		profile: getProfile(syntax),
		addons: syntax === 'jsx' ? { 'jsx': true } : null,
		variables: getVariables(),
		text: textToReplace ? textToReplace : ''
	};
}