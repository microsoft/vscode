/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../../base/common/strings.js';
import { ShiftCommand } from '../../../common/commands/shiftCommand.js';
import { EditOperation, ISingleEditOperation } from '../../../common/core/editOperation.js';
import { normalizeIndentation } from '../../../common/core/indentation.js';
import { Selection } from '../../../common/core/selection.js';
import { StandardTokenType } from '../../../common/encodedTokenAttributes.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { ProcessedIndentRulesSupport } from '../../../common/languages/supports/indentationLineProcessor.js';
import { ITextModel } from '../../../common/model.js';

export function getReindentEditOperations(model: ITextModel, languageConfigurationService: ILanguageConfigurationService, startLineNumber: number, endLineNumber: number): ISingleEditOperation[] {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return [];
	}

	const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).indentRulesSupport;
	if (!indentationRulesSupport) {
		return [];
	}

	const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
	endLineNumber = Math.min(endLineNumber, model.getLineCount());

	// Skip `unIndentedLinePattern` lines
	while (startLineNumber <= endLineNumber) {
		if (!processedIndentRulesSupport.shouldIgnore(startLineNumber)) {
			break;
		}

		startLineNumber++;
	}

	if (startLineNumber > endLineNumber - 1) {
		return [];
	}

	const { tabSize, indentSize, insertSpaces } = model.getOptions();
	const shiftIndent = (indentation: string, count?: number) => {
		count = count || 1;
		return ShiftCommand.shiftIndent(indentation, indentation.length + count, tabSize, indentSize, insertSpaces);
	};
	const unshiftIndent = (indentation: string, count?: number) => {
		count = count || 1;
		return ShiftCommand.unshiftIndent(indentation, indentation.length + count, tabSize, indentSize, insertSpaces);
	};
	const indentEdits: ISingleEditOperation[] = [];

	// indentation being passed to lines below

	// Calculate indentation for the first line
	// If there is no passed-in indentation, we use the indentation of the first line as base.
	const currentLineText = model.getLineContent(startLineNumber);
	let globalIndent = strings.getLeadingWhitespace(currentLineText);
	// idealIndentForNextLine doesn't equal globalIndent when there is a line matching `indentNextLinePattern`.
	let idealIndentForNextLine: string = globalIndent;

	if (processedIndentRulesSupport.shouldIncrease(startLineNumber)) {
		idealIndentForNextLine = shiftIndent(idealIndentForNextLine);
		globalIndent = shiftIndent(globalIndent);
	}
	else if (processedIndentRulesSupport.shouldIndentNextLine(startLineNumber)) {
		idealIndentForNextLine = shiftIndent(idealIndentForNextLine);
	}

	startLineNumber++;

	// Calculate indentation adjustment for all following lines
	for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
		if (doesLineStartWithString(model, lineNumber)) {
			continue;
		}
		const text = model.getLineContent(lineNumber);
		const oldIndentation = strings.getLeadingWhitespace(text);
		const currentIdealIndent = idealIndentForNextLine;

		if (processedIndentRulesSupport.shouldDecrease(lineNumber, currentIdealIndent)) {
			idealIndentForNextLine = unshiftIndent(idealIndentForNextLine);
			globalIndent = unshiftIndent(globalIndent);
		}

		if (oldIndentation !== idealIndentForNextLine) {
			indentEdits.push(EditOperation.replaceMove(new Selection(lineNumber, 1, lineNumber, oldIndentation.length + 1), normalizeIndentation(idealIndentForNextLine, indentSize, insertSpaces)));
		}

		// calculate idealIndentForNextLine
		if (processedIndentRulesSupport.shouldIgnore(lineNumber)) {
			// In reindent phase, if the line matches `unIndentedLinePattern` we inherit indentation from above lines
			// but don't change globalIndent and idealIndentForNextLine.
			continue;
		} else if (processedIndentRulesSupport.shouldIncrease(lineNumber, currentIdealIndent)) {
			globalIndent = shiftIndent(globalIndent);
			idealIndentForNextLine = globalIndent;
		} else if (processedIndentRulesSupport.shouldIndentNextLine(lineNumber, currentIdealIndent)) {
			idealIndentForNextLine = shiftIndent(idealIndentForNextLine);
		} else {
			idealIndentForNextLine = globalIndent;
		}
	}

	return indentEdits;
}

function doesLineStartWithString(model: ITextModel, lineNumber: number): boolean {
	if (!model.tokenization.isCheapToTokenize(lineNumber)) {
		return false;
	}
	const lineTokens = model.tokenization.getLineTokens(lineNumber);
	return lineTokens.getStandardTokenType(0) === StandardTokenType.String;
}
