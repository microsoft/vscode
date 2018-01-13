/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Node, HtmlNode, Rule, Property } from 'EmmetNode';
import { getEmmetHelper, getNode, getInnerRange, getMappingForIncludedLanguages, parseDocument, validate, getEmmetConfiguration, isStyleSheet, getEmmetMode } from './util';

const trimRegex = /[\u00a0]*[\d|#|\-|\*|\u2022]+\.?/;
const hexColorRegex = /^#\d+$/;

interface ExpandAbbreviationInput {
	syntax: string;
	abbreviation: string;
	rangeToReplace: vscode.Range;
	textToWrap?: string[];
	filter?: string;
}

export function wrapWithAbbreviation(args: any) {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}

	const editor = vscode.window.activeTextEditor;

	const syntax = getSyntaxFromArgs({ language: editor.document.languageId });
	if (!syntax) {
		return;
	}

	const abbreviationPromise = (args && args['abbreviation']) ? Promise.resolve(args['abbreviation']) : vscode.window.showInputBox({ prompt: 'Enter Abbreviation' });
	const helper = getEmmetHelper();

	return abbreviationPromise.then(inputAbbreviation => {
		if (!inputAbbreviation || !inputAbbreviation.trim() || !helper.isAbbreviationValid(syntax, inputAbbreviation)) { return false; }

		let extractedResults = helper.extractAbbreviationFromText(inputAbbreviation);
		if (!extractedResults) {
			return false;
		}
		let { abbreviation, filter } = extractedResults;

		let expandAbbrList: ExpandAbbreviationInput[] = [];

		editor.selections.forEach(selection => {
			let rangeToReplace: vscode.Range = selection.isReversed ? new vscode.Range(selection.active, selection.anchor) : selection;
			if (rangeToReplace.isEmpty) {
				rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
			}

			const firstLineOfSelection = editor.document.lineAt(rangeToReplace.start).text.substr(rangeToReplace.start.character);
			const matches = firstLineOfSelection.match(/^(\s*)/);
			const preceedingWhiteSpace = matches ? matches[1].length : 0;

			rangeToReplace = new vscode.Range(rangeToReplace.start.line, rangeToReplace.start.character + preceedingWhiteSpace, rangeToReplace.end.line, rangeToReplace.end.character);
			expandAbbrList.push({ syntax, abbreviation, rangeToReplace, textToWrap: ['\n\t$TM_SELECTED_TEXT\n'], filter });
		});

		return expandAbbreviationInRange(editor, expandAbbrList, true);
	});
}

export function wrapIndividualLinesWithAbbreviation(args: any) {
	if (!validate(false) || !vscode.window.activeTextEditor) {
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (editor.selection.isEmpty) {
		vscode.window.showInformationMessage('Select more than 1 line and try again.');
		return;
	}

	const syntax = getSyntaxFromArgs({ language: editor.document.languageId });
	if (!syntax) {
		return;
	}

	const abbreviationPromise = (args && args['abbreviation']) ? Promise.resolve(args['abbreviation']) : vscode.window.showInputBox({ prompt: 'Enter Abbreviation' });
	const lines = editor.document.getText(editor.selection).split('\n').map(x => x.trim());
	const helper = getEmmetHelper();

	return abbreviationPromise.then(inputAbbreviation => {
		if (!inputAbbreviation || !inputAbbreviation.trim() || !helper.isAbbreviationValid(syntax, inputAbbreviation)) { return false; }

		let extractedResults = helper.extractAbbreviationFromText(inputAbbreviation);
		if (!extractedResults) {
			return false;
		}

		let { abbreviation, filter } = extractedResults;
		let input: ExpandAbbreviationInput = {
			syntax,
			abbreviation,
			rangeToReplace: editor.selection,
			textToWrap: lines,
			filter
		};

		return expandAbbreviationInRange(editor, [input], true);
	});

}

export function expandEmmetAbbreviation(args: any): Thenable<boolean | undefined> {
	if (!validate() || !vscode.window.activeTextEditor) {
		return fallbackTab();
	}

	args = args || {};
	if (!args['language']) {
		args['language'] = vscode.window.activeTextEditor.document.languageId;
	} else {
		const excludedLanguages = vscode.workspace.getConfiguration('emmet')['excludeLanguages'] ? vscode.workspace.getConfiguration('emmet')['excludeLanguages'] : [];
		if (excludedLanguages.indexOf(vscode.window.activeTextEditor.document.languageId) > -1) {
			return fallbackTab();
		}
	}
	const syntax = getSyntaxFromArgs(args);
	if (!syntax) {
		return fallbackTab();
	}

	const editor = vscode.window.activeTextEditor;

	let rootNode = parseDocument(editor.document, false);

	// When tabbed on a non empty selection, do not treat it as an emmet abbreviation, and fallback to tab instead
	if (vscode.workspace.getConfiguration('emmet')['triggerExpansionOnTab'] === true && editor.selections.find(x => !x.isEmpty)) {
		return fallbackTab();
	}

	let abbreviationList: ExpandAbbreviationInput[] = [];
	let firstAbbreviation: string;
	let allAbbreviationsSame: boolean = true;
	const helper = getEmmetHelper();

	let getAbbreviation = (document: vscode.TextDocument, selection: vscode.Selection, position: vscode.Position, syntax: string): [vscode.Range | null, string, string] => {
		let rangeToReplace: vscode.Range = selection;
		let abbr = document.getText(rangeToReplace);
		if (!rangeToReplace.isEmpty) {
			let extractedResults = helper.extractAbbreviationFromText(abbr);
			if (extractedResults) {
				return [rangeToReplace, extractedResults.abbreviation, extractedResults.filter];
			}
			return [null, '', ''];
		}

		const currentLine = editor.document.lineAt(position.line).text;
		const textTillPosition = currentLine.substr(0, position.character);

		// Expand cases like <div to <div></div> explicitly
		// else we will end up with <<div></div>
		if (syntax === 'html') {
			let matches = textTillPosition.match(/<(\w+)$/);
			if (matches) {
				abbr = matches[1];
				rangeToReplace = new vscode.Range(position.translate(0, -(abbr.length + 1)), position);
				return [rangeToReplace, abbr, ''];
			}
		}
		let extractedResults = helper.extractAbbreviation(editor.document, position, false);
		if (!extractedResults) {
			return [null, '', ''];
		}

		let { abbreviationRange, abbreviation, filter } = extractedResults;
		return [new vscode.Range(abbreviationRange.start.line, abbreviationRange.start.character, abbreviationRange.end.line, abbreviationRange.end.character), abbreviation, filter];
	};

	let selectionsInReverseOrder = editor.selections.slice(0);
	selectionsInReverseOrder.sort((a, b) => {
		var posA = a.isReversed ? a.anchor : a.active;
		var posB = b.isReversed ? b.anchor : b.active;
		return posA.compareTo(posB) * -1;
	});

	selectionsInReverseOrder.forEach(selection => {
		let position = selection.isReversed ? selection.anchor : selection.active;
		let [rangeToReplace, abbreviation, filter] = getAbbreviation(editor.document, selection, position, syntax);
		if (!rangeToReplace) {
			return;
		}
		if (!helper.isAbbreviationValid(syntax, abbreviation)) {
			return;
		}

		let currentNode = getNode(rootNode, position, true);
		if (!isValidLocationForEmmetAbbreviation(editor.document, currentNode, syntax, position, rangeToReplace)) {
			return;
		}

		if (!firstAbbreviation) {
			firstAbbreviation = abbreviation;
		} else if (allAbbreviationsSame && firstAbbreviation !== abbreviation) {
			allAbbreviationsSame = false;
		}

		abbreviationList.push({ syntax, abbreviation, rangeToReplace, filter });
	});

	return expandAbbreviationInRange(editor, abbreviationList, allAbbreviationsSame).then(success => {
		if (!success) {
			return fallbackTab();
		}
	});
}

function fallbackTab(): Thenable<boolean | undefined> {
	if (vscode.workspace.getConfiguration('emmet')['triggerExpansionOnTab'] === true) {
		return vscode.commands.executeCommand('tab');
	}
	return Promise.resolve(true);
}
/**
 * Checks if given position is a valid location to expand emmet abbreviation.
 * Works only on html and css/less/scss syntax
 * @param document current Text Document
 * @param currentNode parsed node at given position
 * @param syntax syntax of the abbreviation
 * @param position position to validate
 * @param abbreviationRange The range of the abbreviation for which given position is being validated
 */
export function isValidLocationForEmmetAbbreviation(document: vscode.TextDocument, currentNode: Node | null, syntax: string, position: vscode.Position, abbreviationRange: vscode.Range): boolean {
	if (isStyleSheet(syntax)) {
		// Continue validation only if the file was parse-able and the currentNode has been found
		if (!currentNode) {
			return true;
		}

		// Fix for https://github.com/Microsoft/vscode/issues/34162
		// Other than sass, stylus, we can make use of the terminator tokens to validate position
		if (syntax !== 'sass' && syntax !== 'stylus' && currentNode.type === 'property') {
			const abbreviation = document.getText(new vscode.Range(abbreviationRange.start.line, abbreviationRange.start.character, abbreviationRange.end.line, abbreviationRange.end.character));
			const propertyNode = <Property>currentNode;
			if (propertyNode.terminatorToken
				&& propertyNode.separator
				&& position.isAfterOrEqual(propertyNode.separatorToken.end)
				&& position.isBeforeOrEqual(propertyNode.terminatorToken.start)) {
				return hexColorRegex.test(abbreviation);
			}
			if (!propertyNode.terminatorToken
				&& propertyNode.separator
				&& position.isAfterOrEqual(propertyNode.separatorToken.end)) {
				return hexColorRegex.test(abbreviation);
			}
		}

		// If current node is a rule or at-rule, then perform additional checks to ensure
		// emmet suggestions are not provided in the rule selector
		if (currentNode.type !== 'rule' && currentNode.type !== 'at-rule') {
			return true;
		}

		const currentCssNode = <Rule>currentNode;

		// Position is valid if it occurs after the `{` that marks beginning of rule contents
		if (position.isAfter(currentCssNode.contentStartToken.end)) {
			return true;
		}

		// Workaround for https://github.com/Microsoft/vscode/30188
		// The line above the rule selector is considered as part of the selector by the css-parser
		// But we should assume it is a valid location for css properties under the parent rule
		if (currentCssNode.parent
			&& (currentCssNode.parent.type === 'rule' || currentCssNode.parent.type === 'at-rule')
			&& currentCssNode.selectorToken
			&& position.line !== currentCssNode.selectorToken.end.line
			&& currentCssNode.selectorToken.start.character === abbreviationRange.start.character
			&& currentCssNode.selectorToken.start.line === abbreviationRange.start.line
		) {
			return true;
		}

		return false;
	}

	const startAngle = '<';
	const endAngle = '>';
	const escape = '\\';
	const question = '?';
	const currentHtmlNode = <HtmlNode>currentNode;
	let start = new vscode.Position(0, 0);

	if (currentHtmlNode) {
		const innerRange = getInnerRange(currentHtmlNode);

		// Fix for https://github.com/Microsoft/vscode/issues/28829
		if (!innerRange || !innerRange.contains(position)) {
			return false;
		}

		// Fix for https://github.com/Microsoft/vscode/issues/35128
		// Find the position up till where we will backtrack looking for unescaped < or >
		// to decide if current position is valid for emmet expansion
		start = innerRange.start;
		let lastChildBeforePosition = currentHtmlNode.firstChild;
		while (lastChildBeforePosition) {
			if (lastChildBeforePosition.end.isAfter(position)) {
				break;
			}
			start = lastChildBeforePosition.end;
			lastChildBeforePosition = lastChildBeforePosition.nextSibling;
		}
	}
	let textToBackTrack = document.getText(new vscode.Range(start.line, start.character, abbreviationRange.start.line, abbreviationRange.start.character));

	// Worse case scenario is when cursor is inside a big chunk of text which needs to backtracked
	// Backtrack only 500 offsets to ensure we dont waste time doing this
	if (textToBackTrack.length > 500) {
		textToBackTrack = textToBackTrack.substr(textToBackTrack.length - 500);
	}

	if (!textToBackTrack.trim()) {
		return true;
	}

	let valid = true;
	let foundSpace = false; // If < is found before finding whitespace, then its valid abbreviation. Eg: <div|
	let i = textToBackTrack.length - 1;
	while (i >= 0) {
		const char = textToBackTrack[i];
		i--;
		if (!foundSpace && /\s/.test(char)) {
			foundSpace = true;
			continue;
		}
		if (char === question && textToBackTrack[i] === startAngle) {
			i--;
			continue;
		}
		if (char !== startAngle && char !== endAngle) {
			continue;
		}
		if (i >= 0 && textToBackTrack[i] === escape) {
			i--;
			continue;
		}
		if (char === endAngle) {
			break;
		}
		if (char === startAngle) {
			valid = !foundSpace;
			break;
		}
	}

	return valid;
}

/**
 * Expands abbreviations as detailed in expandAbbrList in the editor
 * @param editor
 * @param expandAbbrList
 * @param insertSameSnippet
 * @returns false if no snippet can be inserted.
 */
function expandAbbreviationInRange(editor: vscode.TextEditor, expandAbbrList: ExpandAbbreviationInput[], insertSameSnippet: boolean): Thenable<boolean> {
	if (!expandAbbrList || expandAbbrList.length === 0) {
		return Promise.resolve(false);
	}

	// Snippet to replace at multiple cursors are not the same
	// `editor.insertSnippet` will have to be called for each instance separately
	// We will not be able to maintain multiple cursors after snippet insertion
	let insertPromises: Thenable<boolean>[] = [];
	if (!insertSameSnippet) {
		expandAbbrList.forEach((expandAbbrInput: ExpandAbbreviationInput) => {
			let expandedText = expandAbbr(expandAbbrInput);
			if (expandedText) {
				insertPromises.push(editor.insertSnippet(new vscode.SnippetString(expandedText), expandAbbrInput.rangeToReplace));
			}
		});
		if (insertPromises.length === 0) {
			return Promise.resolve(false);
		}
		return Promise.all(insertPromises).then(() => Promise.resolve(true));
	}

	// Snippet to replace at all cursors are the same
	// We can pass all ranges to `editor.insertSnippet` in a single call so that
	// all cursors are maintained after snippet insertion
	const anyExpandAbbrInput = expandAbbrList[0];
	let expandedText = expandAbbr(anyExpandAbbrInput);
	let allRanges = expandAbbrList.map(value => {
		return new vscode.Range(value.rangeToReplace.start.line, value.rangeToReplace.start.character, value.rangeToReplace.end.line, value.rangeToReplace.end.character);
	});
	if (expandedText) {
		return editor.insertSnippet(new vscode.SnippetString(expandedText), allRanges);
	}
	return Promise.resolve(false);
}

/**
 * Expands abbreviation as detailed in given input.
 */
function expandAbbr(input: ExpandAbbreviationInput): string | undefined {
	const helper = getEmmetHelper();
	const expandOptions = helper.getExpandOptions(input.syntax, getEmmetConfiguration(input.syntax), input.filter);

	if (input.textToWrap) {
		if (input.filter && input.filter.indexOf('t') > -1) {
			input.textToWrap = input.textToWrap.map(line => {
				return line.replace(trimRegex, '').trim();
			});
		}
		expandOptions['text'] = input.textToWrap;

		// Below fixes https://github.com/Microsoft/vscode/issues/29898
		// With this, Emmet formats inline elements as block elements
		// ensuring the wrapped multi line text does not get merged to a single line
		if (!input.rangeToReplace.isSingleLine) {
			expandOptions.profile['inlineBreak'] = 1;
		}
	}

	try {
		// Expand the abbreviation
		let expandedText = helper.expandAbbreviation(input.abbreviation, expandOptions);

		if (input.textToWrap) {
			// All $anyword would have been escaped by the emmet helper.
			// Remove the escaping backslash from $TM_SELECTED_TEXT so that VS Code Snippet controller can treat it as a variable
			expandedText = expandedText.replace('\\$TM_SELECTED_TEXT', '$TM_SELECTED_TEXT');

			// If the expanded text is single line then we dont need the \t and \n we added to $TM_SELECTED_TEXT earlier
			if (input.textToWrap.length === 1 && expandedText.indexOf('\n') === -1) {
				expandedText = expandedText.replace(/\s*\$TM_SELECTED_TEXT\s*/, '$TM_SELECTED_TEXT');
			}
		}

		return expandedText;

	} catch (e) {
		vscode.window.showErrorMessage('Failed to expand abbreviation');
	}


}

function getSyntaxFromArgs(args: Object): string | undefined {
	const mappedModes = getMappingForIncludedLanguages();
	const language: string = args['language'];
	const parentMode: string = args['parentMode'];
	const excludedLanguages = vscode.workspace.getConfiguration('emmet')['excludeLanguages'] ? vscode.workspace.getConfiguration('emmet')['excludeLanguages'] : [];
	if (excludedLanguages.indexOf(language) > -1) {
		return;
	}

	let syntax = getEmmetMode((mappedModes[language] ? mappedModes[language] : language), excludedLanguages);
	if (!syntax) {
		syntax = getEmmetMode((mappedModes[parentMode] ? mappedModes[parentMode] : parentMode), excludedLanguages);
	}

	return syntax;
}