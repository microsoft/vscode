/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { normalizeIndentation } from 'vs/editor/common/core/indentation';
import { Selection } from 'vs/editor/common/core/selection';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ITextModel } from 'vs/editor/common/model';

export function getReindentEditOperations(model: ITextModel, languageConfigurationService: ILanguageConfigurationService, startLineNumber: number, endLineNumber: number, inheritedIndent?: string): ISingleEditOperation[] {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return [];
	}

	const indentationRules = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).indentationRules;
	if (!indentationRules) {
		return [];
	}

	// end line number is minimum of the end line number and the line count
	endLineNumber = Math.min(endLineNumber, model.getLineCount());

	// Skip `unIndentedLinePattern` lines
	while (startLineNumber <= endLineNumber) {
		if (!indentationRules.unIndentedLinePattern) {
			break;
		}

		const text = model.getLineContent(startLineNumber);
		// If the text at the start line number does not match the `unIndentedLinePattern`, then break
		if (!indentationRules.unIndentedLinePattern.test(text)) {
			break;
		}

		startLineNumber++;
	}

	// No edit operations when start line number equal to end line number or more
	if (startLineNumber > endLineNumber - 1) {
		return [];
	}

	const { tabSize, indentSize, insertSpaces } = model.getOptions();
	const shiftIndent = (indentation: string, count?: number) => {
		count = count || 1;
		// Here count is the column number
		return ShiftCommand.shiftIndent(indentation, indentation.length + count, tabSize, indentSize, insertSpaces);
	};
	const unshiftIndent = (indentation: string, count?: number) => {
		count = count || 1;
		return ShiftCommand.unshiftIndent(indentation, indentation.length + count, tabSize, indentSize, insertSpaces);
	};
	const indentEdits: ISingleEditOperation[] = [];

	// indentation being passed to lines below
	let globalIndent: string;

	// Calculate indentation for the first line
	// If there is no passed-in indentation, we use the indentation of the first line as base.
	const currentLineText = model.getLineContent(startLineNumber);
	let adjustedLineContent = currentLineText;
	if (inheritedIndent !== undefined && inheritedIndent !== null) {
		globalIndent = inheritedIndent;
		// current indentation at the current line
		const oldIndentation = strings.getLeadingWhitespace(currentLineText);

		// Add to the global intent the current indentation
		adjustedLineContent = globalIndent + currentLineText.substring(oldIndentation.length);
		if (indentationRules.decreaseIndentPattern && indentationRules.decreaseIndentPattern.test(adjustedLineContent)) {
			// unshift the global indent
			globalIndent = unshiftIndent(globalIndent);
			// add again the current indentation
			adjustedLineContent = globalIndent + currentLineText.substring(oldIndentation.length);

		}
		if (currentLineText !== adjustedLineContent) {
			// normalize indentation depending on if we want to use spaces only or by using tabs only
			// replacing the previous indent, with the normalized indent
			indentEdits.push(EditOperation.replaceMove(new Selection(startLineNumber, 1, startLineNumber, oldIndentation.length + 1), normalizeIndentation(globalIndent, indentSize, insertSpaces)));
		}
	} else {
		globalIndent = strings.getLeadingWhitespace(currentLineText);
	}

	// idealIndentForNextLine doesn't equal globalIndent when there is a line matching `indentNextLinePattern`.
	let idealIndentForNextLine: string = globalIndent;

	console.log('indentationRules.increaseIndentPattern.source : ', indentationRules.increaseIndentPattern.source);
	if (indentationRules.increaseIndentPattern && indentationRules.increaseIndentPattern.test(adjustedLineContent)) {
		// need to shift the indent of the next line
		idealIndentForNextLine = shiftIndent(idealIndentForNextLine);
		globalIndent = shiftIndent(globalIndent);
	}
	else if (indentationRules.indentNextLinePattern && indentationRules.indentNextLinePattern.test(adjustedLineContent)) {
		// we shift the indent of the next line but not of the global indent
		idealIndentForNextLine = shiftIndent(idealIndentForNextLine);
	}

	startLineNumber++;

	// Calculate indentation adjustment for all following lines
	for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
		const text = model.getLineContent(lineNumber);
		const oldIndentation = strings.getLeadingWhitespace(text);
		// adding the ideal indentation and adding to the it the current text without the indentation
		const adjustedLineContent = idealIndentForNextLine + text.substring(oldIndentation.length);

		if (indentationRules.decreaseIndentPattern && indentationRules.decreaseIndentPattern.test(adjustedLineContent)) {
			idealIndentForNextLine = unshiftIndent(idealIndentForNextLine);
			globalIndent = unshiftIndent(globalIndent);
		}

		// Suppose that the initial indentation is not equal to the ideal indentation for the next line, then add an edit
		if (oldIndentation !== idealIndentForNextLine) {
			indentEdits.push(EditOperation.replaceMove(new Selection(lineNumber, 1, lineNumber, oldIndentation.length + 1), normalizeIndentation(idealIndentForNextLine, indentSize, insertSpaces)));
		}

		// calculate idealIndentForNextLine
		if (indentationRules.unIndentedLinePattern && indentationRules.unIndentedLinePattern.test(text)) {
			// In reindent phase, if the line matches `unIndentedLinePattern` we inherit indentation from above lines
			// but don't change globalIndent and idealIndentForNextLine.
			continue;
		} else if (indentationRules.increaseIndentPattern && indentationRules.increaseIndentPattern.test(adjustedLineContent)) {
			globalIndent = shiftIndent(globalIndent);
			// setting ideal indent for next line to global indent, becaue the shift of the indent applies to all next lines
			idealIndentForNextLine = globalIndent;
		} else if (indentationRules.indentNextLinePattern && indentationRules.indentNextLinePattern.test(adjustedLineContent)) {
			idealIndentForNextLine = shiftIndent(idealIndentForNextLine);
		} else {
			idealIndentForNextLine = globalIndent;
		}
	}

	return indentEdits;
}
