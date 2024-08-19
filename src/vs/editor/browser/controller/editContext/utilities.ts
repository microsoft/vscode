/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import * as strings from 'vs/base/common/strings';

export interface ITypeData {
	text: string;
	replacePrevCharCnt: number;
	replaceNextCharCnt: number;
	positionDelta: number;
}

export interface ISimpleModel {
	getLineCount(): number;
	getLineMaxColumn(lineNumber: number): number;
	getValueInRange(range: Range, eol: EndOfLinePreference): string;
	getValueLengthInRange(range: Range, eol: EndOfLinePreference): number;
	modifyPosition(position: Position, offset: number): Position;
}

export class PagedScreenReaderStrategy {
	private static _getPageOfLine(lineNumber: number, linesPerPage: number): number {
		return Math.floor((lineNumber - 1) / linesPerPage);
	}

	private static _getRangeForPage(page: number, linesPerPage: number): Range {
		const offset = page * linesPerPage;
		const startLineNumber = offset + 1;
		const endLineNumber = offset + linesPerPage;
		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	public static fromEditorSelection(model: ISimpleModel, selection: Range, linesPerPage: number, trimLongText: boolean): {
		value: string;
		selectionStart: number;
		selectionEnd: number;
		newLineCountBeforeSelection: number;
	} {
		// Chromium handles very poorly text even of a few thousand chars
		// Cut text to avoid stalling the entire UI
		const LIMIT_CHARS = 500;

		const selectionStartPage = PagedScreenReaderStrategy._getPageOfLine(selection.startLineNumber, linesPerPage);
		const selectionStartPageRange = PagedScreenReaderStrategy._getRangeForPage(selectionStartPage, linesPerPage);

		const selectionEndPage = PagedScreenReaderStrategy._getPageOfLine(selection.endLineNumber, linesPerPage);
		const selectionEndPageRange = PagedScreenReaderStrategy._getRangeForPage(selectionEndPage, linesPerPage);

		let pretextRange = selectionStartPageRange.intersectRanges(new Range(1, 1, selection.startLineNumber, selection.startColumn))!;
		if (trimLongText && model.getValueLengthInRange(pretextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
			const pretextStart = model.modifyPosition(pretextRange.getEndPosition(), -LIMIT_CHARS);
			pretextRange = Range.fromPositions(pretextStart, pretextRange.getEndPosition());
		}
		const pretext = model.getValueInRange(pretextRange, EndOfLinePreference.LF);

		const lastLine = model.getLineCount();
		const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
		let posttextRange = selectionEndPageRange.intersectRanges(new Range(selection.endLineNumber, selection.endColumn, lastLine, lastLineMaxColumn))!;
		if (trimLongText && model.getValueLengthInRange(posttextRange, EndOfLinePreference.LF) > LIMIT_CHARS) {
			const posttextEnd = model.modifyPosition(posttextRange.getStartPosition(), LIMIT_CHARS);
			posttextRange = Range.fromPositions(posttextRange.getStartPosition(), posttextEnd);
		}
		const posttext = model.getValueInRange(posttextRange, EndOfLinePreference.LF);


		let text: string;
		if (selectionStartPage === selectionEndPage || selectionStartPage + 1 === selectionEndPage) {
			// take full selection
			text = model.getValueInRange(selection, EndOfLinePreference.LF);
		} else {
			const selectionRange1 = selectionStartPageRange.intersectRanges(selection)!;
			const selectionRange2 = selectionEndPageRange.intersectRanges(selection)!;
			text = (
				model.getValueInRange(selectionRange1, EndOfLinePreference.LF)
				+ String.fromCharCode(8230)
				+ model.getValueInRange(selectionRange2, EndOfLinePreference.LF)
			);
		}
		if (trimLongText && text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return {
			value: pretext + text + posttext,
			selectionStart: pretext.length,
			selectionEnd: pretext.length + text.length,
			newLineCountBeforeSelection: pretextRange.endLineNumber - pretextRange.startLineNumber,
		};
	}
}

export function findNewLineCountBeforeSelection(current: { value: string; selectionStart: number }, previous: { value: string; selectionStart: number; newLineCountBeforeSelection: number | undefined } | undefined): number | undefined {
	let newLineCountBeforeSelection: number | undefined = undefined;
	if (previous) {
		const valueBeforeSelectionStart = current.value.substring(0, current.selectionStart);
		const previousValueBeforeSelectionStart = previous.value.substring(0, previous.selectionStart);
		if (valueBeforeSelectionStart === previousValueBeforeSelectionStart) {
			newLineCountBeforeSelection = previous.newLineCountBeforeSelection;
		}
	}
	return newLineCountBeforeSelection;
}

export function deduceInput(previousState: { value: string; selectionStart: number; selectionEnd: number } | undefined, currentState: { value: string; selectionStart: number; selectionEnd: number }): {
	text: string;
	replacePrevCharCnt: number;
	replaceNextCharCnt: number;
	positionDelta: number;
} {
	console.log('deduceInput');
	console.log('currentState : ', currentState);
	console.log('previousState : ', previousState);
	if (!previousState) {
		// This is the EMPTY state
		return {
			text: '',
			replacePrevCharCnt: 0,
			replaceNextCharCnt: 0,
			positionDelta: 0
		};
	}

	const prefixLength = Math.min(
		strings.commonPrefixLength(previousState.value, currentState.value),
		previousState.selectionStart,
		currentState.selectionStart
	);
	const suffixLength = Math.min(
		strings.commonSuffixLength(previousState.value, currentState.value),
		previousState.value.length - previousState.selectionEnd,
		currentState.value.length - currentState.selectionEnd
	);
	const currentValue = currentState.value.substring(prefixLength, currentState.value.length - suffixLength);
	const previousSelectionStart = previousState.selectionStart - prefixLength;
	const previousSelectionEnd = previousState.selectionEnd - prefixLength;
	const currentSelectionStart = currentState.selectionStart - prefixLength;
	const currentSelectionEnd = currentState.selectionEnd - prefixLength;

	if (currentSelectionStart === currentSelectionEnd) {
		// no current selection
		const replacePreviousCharacters = (previousState.selectionStart - prefixLength);

		return {
			text: currentValue,
			replacePrevCharCnt: replacePreviousCharacters,
			replaceNextCharCnt: 0,
			positionDelta: 0
		};
	}

	// there is a current selection => composition case
	const replacePreviousCharacters = previousSelectionEnd - previousSelectionStart;
	return {
		text: currentValue,
		replacePrevCharCnt: replacePreviousCharacters,
		replaceNextCharCnt: 0,
		positionDelta: 0
	};
}
