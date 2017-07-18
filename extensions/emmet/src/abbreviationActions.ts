/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { expand } from '@emmetio/expand-abbreviation';
import { Node, HtmlNode, Rule } from 'EmmetNode';
import { getNode, getInnerRange, getMappingForIncludedLanguages, parse, validate } from './util';
import { getExpandOptions, extractAbbreviation, isStyleSheet, isAbbreviationValid, getEmmetMode } from 'vscode-emmet-helper';

interface ExpandAbbreviationInput {
	syntax: string;
	abbreviation: string;
	rangeToReplace: vscode.Range;
	textToWrap?: string;
	preceedingWhiteSpace?: string;
}

export function wrapWithAbbreviation(args) {
	const syntax = getSyntaxFromArgs(args);
	if (!syntax || !validate()) {
		return;
	}

	const editor = vscode.window.activeTextEditor;
	const newLine = editor.document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';

	vscode.window.showInputBox({ prompt: 'Enter Abbreviation' }).then(abbreviation => {
		if (!abbreviation || !abbreviation.trim() || !isAbbreviationValid(syntax, abbreviation)) { return; }

		let expandAbbrList: ExpandAbbreviationInput[] = [];
		let firstTextToReplace: string;
		let allTextToReplaceSame: boolean = true;

		editor.selections.forEach(selection => {
			let rangeToReplace: vscode.Range = selection.isReversed ? new vscode.Range(selection.active, selection.anchor) : selection;
			if (rangeToReplace.isEmpty) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
			}
			const firstLine = editor.document.lineAt(rangeToReplace.start).text;
			const firstLineTillSelection = firstLine.substr(0, rangeToReplace.start.character);
			const noTextBeforeSelection = /^\s*$/.test(firstLineTillSelection);
			let textToWrap = '';
			let preceedingWhiteSpace = '';

			if (noTextBeforeSelection) {
				const matches = firstLine.match(/^(\s*)/);
				if (matches) {
					preceedingWhiteSpace = matches[1];
				}
				if (rangeToReplace.start.character <= preceedingWhiteSpace.length) {
					rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.end.line, rangeToReplace.end.character);
				}

				textToWrap = newLine;
				for (let i = rangeToReplace.start.line; i <= rangeToReplace.end.line; i++) {
					textToWrap += '\t' + editor.document.lineAt(i).text.substr(preceedingWhiteSpace.length) + newLine;
				}
			} else {
				textToWrap = editor.document.getText(rangeToReplace);
			}

			if (!firstTextToReplace) {
				firstTextToReplace = textToWrap;
			} else if (allTextToReplaceSame && firstTextToReplace !== textToWrap) {
				allTextToReplaceSame = false;
			}

			expandAbbrList.push({ syntax, abbreviation, rangeToReplace, textToWrap, preceedingWhiteSpace });
		});

		expandAbbreviationInRange(editor, expandAbbrList, allTextToReplaceSame);
	});
}

export function expandAbbreviation(args) {
	const syntax = getSyntaxFromArgs(args);
	if (!syntax || !validate()) {
		return;
	}

	const editor = vscode.window.activeTextEditor;

	let rootNode = parse(editor.document);
	if (!rootNode) {
		return;
	}

	let abbreviationList: ExpandAbbreviationInput[] = [];
	let firstAbbreviation: string;
	let allAbbreviationsSame: boolean = true;

	let getAbbreviation = (document: vscode.TextDocument, selection: vscode.Selection, position: vscode.Position, isHtml: boolean): [vscode.Range, string] => {
		let rangeToReplace: vscode.Range = selection;
		let abbreviation = document.getText(rangeToReplace);
		if (!rangeToReplace.isEmpty) {
			return [rangeToReplace, abbreviation];
		}

		// Expand cases like <div to <div></div> explicitly
		// else we will end up with <<div></div>
		if (isHtml) {
			const currentLine = editor.document.lineAt(position.line).text;
			const textTillPosition = currentLine.substr(0, position.character);
			let matches = textTillPosition.match(/<(\w+)$/);
			if (matches) {
				abbreviation = matches[1];
				rangeToReplace = new vscode.Range(position.translate(0, -(abbreviation.length + 1)), position);
				return [rangeToReplace, abbreviation];
			}
		}
		return extractAbbreviation(editor.document, position);
	};

	editor.selections.forEach(selection => {
		let position = selection.isReversed ? selection.anchor : selection.active;
		let [rangeToReplace, abbreviation] = getAbbreviation(editor.document, selection, position, syntax === 'html');
		if (!isAbbreviationValid(syntax, abbreviation)) {
			vscode.window.showErrorMessage('Emmet: Invalid abbreviation');
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

	expandAbbreviationInRange(editor, abbreviationList, allAbbreviationsSame);
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
		if (currentNode.type !== 'rule') {
			return true;
		}
		const currentCssNode = <Rule>currentNode;
		return currentCssNode.selectorToken && position.isAfter(currentCssNode.selectorToken.end);
	}

	const currentHtmlNode = <HtmlNode>currentNode;
	if (currentHtmlNode.close) {
		return getInnerRange(currentHtmlNode).contains(position);
	}

	return false;
}

/**
 * Expands abbreviations as detailed in expandAbbrList in the editor
 * @param editor
 * @param expandAbbrList
 * @param insertSameSnippet
 */
function expandAbbreviationInRange(editor: vscode.TextEditor, expandAbbrList: ExpandAbbreviationInput[], insertSameSnippet: boolean) {
	if (!expandAbbrList || expandAbbrList.length === 0) {
		return;
	}
	const newLine = editor.document.eol === vscode.EndOfLine.LF ? '\n' : '\r\n';

	// Snippet to replace at multiple cursors are not the same
	// `editor.insertSnippet` will have to be called for each instance separately
	// We will not be able to maintain multiple cursors after snippet insertion
	if (!insertSameSnippet) {
		expandAbbrList.forEach((expandAbbrInput: ExpandAbbreviationInput) => {
			let expandedText = expandAbbr(expandAbbrInput, newLine);
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
	let expandedText = expandAbbr(anyExpandAbbrInput, newLine);
	let allRanges = expandAbbrList.map(value => {
		return new vscode.Range(value.rangeToReplace.start.line, value.rangeToReplace.start.character, value.rangeToReplace.end.line, value.rangeToReplace.end.character);
	});
	if (expandedText) {
		editor.insertSnippet(new vscode.SnippetString(expandedText), allRanges);
	}
}

/**
 * Expands abbreviation as detailed in given input.
 * If there is textToWrap, then given preceedingWhiteSpace is applied
 */
function expandAbbr(input: ExpandAbbreviationInput, newLine: string): string {
	const emmetConfig = vscode.workspace.getConfiguration('emmet');
	const expandOptions = getExpandOptions(emmetConfig['syntaxProfiles'], emmetConfig['variables'], input.syntax, input.textToWrap);
	// Expand the abbreviation
	let expandedText;
	try {
		expandedText = expand(input.abbreviation, expandOptions);
	} catch (e) {
		vscode.window.showErrorMessage('Failed to expand abbreviation');
	}

	if (!expandedText) {
		return;
	}

	// If no text to wrap, then return the expanded text
	if (!input.textToWrap) {
		return expandedText;
	}

	// There was text to wrap, and the final expanded text is multi line
	// So add the preceedingWhiteSpace to each line
	if (expandedText.indexOf('\n') > -1) {
		return expandedText.split(newLine).map(line => input.preceedingWhiteSpace + line).join(newLine);
	}

	// There was text to wrap and the final expanded text is single line
	// This can happen when the abbreviation was for an inline element
	// Remove the preceeding newLine + tab and the ending newLine, that was added to textToWrap
	// And re-expand the abbreviation
	let regex = newLine === '\n' ? /^\n\t(.*)\n$/ : /^\r\n\t(.*)\r\n$/;
	let matches = input.textToWrap.match(regex);
	if (matches) {
		input.textToWrap = matches[1];
		return expandAbbr(input, newLine);
	}

	return input.preceedingWhiteSpace + expandedText;
}

function getSyntaxFromArgs(args: any): string {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active.');
		return;
	}

	const mappedModes = getMappingForIncludedLanguages();
	let language: string = (typeof args !== 'object' || !args['language']) ? editor.document.languageId : args['language'];
	let parentMode: string = typeof args === 'object' ? args['parentMode'] : undefined;
	let excludedLanguages = vscode.workspace.getConfiguration('emmet')['exlcudeLanguages'] ? vscode.workspace.getConfiguration('emmet')['exlcudeLanguages'] : [];
	let syntax = getEmmetMode((mappedModes[language] ? mappedModes[language] : language), excludedLanguages);
	if (syntax) {
		return syntax;
	}

	return getEmmetMode((mappedModes[parentMode] ? mappedModes[parentMode] : parentMode), excludedLanguages);
}