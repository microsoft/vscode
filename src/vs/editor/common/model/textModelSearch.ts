/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IPosition } from 'vs/editor/common/editorCommon';
import { CharCode } from 'vs/base/common/charCode';
import { TextModel } from 'vs/editor/common/model/textModel';

const LIMIT_FIND_COUNT = 999;

export class SearchParams {
	public readonly searchString: string;
	public readonly isRegex: boolean;
	public readonly matchCase: boolean;
	public readonly wholeWord: boolean;

	constructor(searchString: string, isRegex: boolean, matchCase: boolean, wholeWord: boolean) {
		this.searchString = searchString;
		this.isRegex = isRegex;
		this.matchCase = matchCase;
		this.wholeWord = wholeWord;
	}

	private static _isMultilineRegexSource(searchString: string): boolean {
		if (!searchString || searchString.length === 0) {
			return false;
		}

		for (let i = 0, len = searchString.length; i < len; i++) {
			const chCode = searchString.charCodeAt(i);

			if (chCode === CharCode.Backslash) {

				// move to next char
				i++;

				if (i >= len) {
					// string ends with a \
					break;
				}

				const nextChCode = searchString.charCodeAt(i);
				if (nextChCode === CharCode.n || nextChCode === CharCode.r) {
					return true;
				}
			}
		}

		return false;
	}

	public parseSearchRequest(): RegExp {
		if (this.searchString === '') {
			return null;
		}

		// Try to create a RegExp out of the params
		let multiline: boolean;
		if (this.isRegex) {
			multiline = SearchParams._isMultilineRegexSource(this.searchString);
		} else {
			multiline = (this.searchString.indexOf('\n') >= 0);
		}

		let regex: RegExp = null;
		try {
			regex = strings.createRegExp(this.searchString, this.isRegex, {
				matchCase: this.matchCase,
				wholeWord: this.wholeWord,
				multiline,
				global: true
			});
		} catch (err) {
			return null;
		}

		if (!regex) {
			return null;
		}

		return regex;
	}
}

export class TextModelSearch {

	public static findMatches(model: TextModel, searchParams: SearchParams, searchRange: Range, limitResultCount: number): Range[] {
		const regex = searchParams.parseSearchRequest();
		if (!regex) {
			return [];
		}

		if (regex.multiline) {
			return this._doFindMatchesMultiline(model, searchRange, regex, limitResultCount);
		}
		return this._doFindMatchesLineByLine(model, searchRange, regex, limitResultCount);
	}

	private static _doFindMatchesMultiline(model: TextModel, searchRange: Range, searchRegex: RegExp, limitResultCount: number): Range[] {
		const deltaOffset = model.getOffsetAt(searchRange.getStartPosition());
		const text = model.getValueInRange(searchRange);

		const result: Range[] = [];
		let prevStartOffset = 0;
		let prevEndOffset = 0;
		let counter = 0;

		let m: RegExpExecArray;
		while ((m = searchRegex.exec(text))) {
			const startOffset = deltaOffset + m.index;
			const endOffset = startOffset + m[0].length;

			if (prevStartOffset === startOffset && prevEndOffset === endOffset) {
				// Exit early if the regex matches the same range
				return result;
			}

			const startPosition = model.getPositionAt(startOffset);
			const endPosition = model.getPositionAt(endOffset);

			result[counter++] = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
			if (counter >= limitResultCount) {
				return result;
			}

			prevStartOffset = startOffset;
			prevEndOffset = endOffset;
		}

		return result;
	}

	private static _doFindMatchesLineByLine(model: TextModel, searchRange: Range, searchRegex: RegExp, limitResultCount: number): Range[] {
		const result: Range[] = [];
		let counter = 0;

		// Early case for a search range that starts & stops on the same line number
		if (searchRange.startLineNumber === searchRange.endLineNumber) {
			const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1, searchRange.endColumn - 1);
			counter = this._findMatchesInLine(searchRegex, text, searchRange.startLineNumber, searchRange.startColumn - 1, counter, result, limitResultCount);
			return result;
		}

		// Collect results from first line
		const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1);
		counter = this._findMatchesInLine(searchRegex, text, searchRange.startLineNumber, searchRange.startColumn - 1, counter, result, limitResultCount);

		// Collect results from middle lines
		for (let lineNumber = searchRange.startLineNumber + 1; lineNumber < searchRange.endLineNumber && counter < limitResultCount; lineNumber++) {
			counter = this._findMatchesInLine(searchRegex, model.getLineContent(lineNumber), lineNumber, 0, counter, result, limitResultCount);
		}

		// Collect results from last line
		if (counter < limitResultCount) {
			const text = model.getLineContent(searchRange.endLineNumber).substring(0, searchRange.endColumn - 1);
			counter = this._findMatchesInLine(searchRegex, text, searchRange.endLineNumber, 0, counter, result, limitResultCount);
		}

		return result;
	}

	public static findNextMatch(model: TextModel, searchParams: SearchParams, rawSearchStart: IPosition): Range {
		const regex = searchParams.parseSearchRequest();
		if (!regex) {
			return null;
		}

		const searchStart = model.validatePosition(rawSearchStart);
		if (regex.multiline) {
			return this._doFindNextMatchMultiline(model, searchStart, regex);
		}
		return this._doFindNextMatchLineByLine(model, searchStart, regex);

	}

	private static _doFindNextMatchMultiline(model: TextModel, searchStart: Position, searchRegex: RegExp): Range {
		const searchTextStart: IPosition = { lineNumber: searchStart.lineNumber, column: 1 };
		const deltaOffset = model.getOffsetAt(searchTextStart);
		const lineCount = model.getLineCount();
		const text = model.getValueInRange(new Range(searchTextStart.lineNumber, searchTextStart.column, lineCount, model.getLineMaxColumn(lineCount)));
		searchRegex.lastIndex = searchStart.column - 1;
		let m = searchRegex.exec(text);
		if (m) {
			const startOffset = deltaOffset + m.index;
			const endOffset = startOffset + m[0].length;
			const startPosition = model.getPositionAt(startOffset);
			const endPosition = model.getPositionAt(endOffset);
			return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		}

		if (searchStart.lineNumber !== 1 || searchStart.column !== -1) {
			// Try again from the top
			return this._doFindNextMatchMultiline(model, new Position(1, 1), searchRegex);
		}

		return null;
	}

	private static _doFindNextMatchLineByLine(model: TextModel, searchStart: Position, searchRegex: RegExp): Range {
		const lineCount = model.getLineCount();
		const startLineNumber = searchStart.lineNumber;

		// Look in first line
		const text = model.getLineContent(startLineNumber);
		const r = this._findFirstMatchInLine(searchRegex, text, startLineNumber, searchStart.column);
		if (r) {
			return r;
		}

		for (let i = 1; i <= lineCount; i++) {
			const lineIndex = (startLineNumber + i - 1) % lineCount;
			const text = model.getLineContent(lineIndex + 1);
			const r = this._findFirstMatchInLine(searchRegex, text, lineIndex + 1, 1);
			if (r) {
				return r;
			}
		}

		return null;
	}

	public static findPreviousMatch(model: TextModel, searchParams: SearchParams, rawSearchStart: IPosition): Range {
		const regex = searchParams.parseSearchRequest();
		if (!regex) {
			return null;
		}

		const searchStart = model.validatePosition(rawSearchStart);
		if (regex.multiline) {
			return this._doFindPreviousMatchMultiline(model, searchStart, regex);
		}
		return this._doFindPreviousMatchLineByLine(model, searchStart, regex);
	}

	private static _doFindPreviousMatchMultiline(model: TextModel, searchStart: Position, searchRegex: RegExp): Range {
		const matches = this._doFindMatchesMultiline(model, new Range(1, 1, searchStart.lineNumber, searchStart.column), searchRegex, 10 * LIMIT_FIND_COUNT);
		if (matches.length > 0) {
			return matches[matches.length - 1];
		}

		const lineCount = model.getLineCount();
		if (searchStart.lineNumber !== lineCount || searchStart.column !== model.getLineMaxColumn(lineCount)) {
			// Try again with all content
			return this._doFindPreviousMatchMultiline(model, new Position(lineCount, model.getLineMaxColumn(lineCount)), searchRegex);
		}

		return null;
	}

	private static _doFindPreviousMatchLineByLine(model: TextModel, searchStart: Position, searchRegex: RegExp): Range {
		const lineCount = model.getLineCount();
		const startLineNumber = searchStart.lineNumber;

		// Look in first line
		const text = model.getLineContent(startLineNumber).substring(0, searchStart.column - 1);
		const r = this._findLastMatchInLine(searchRegex, text, startLineNumber);
		if (r) {
			return r;
		}

		for (let i = 1; i <= lineCount; i++) {
			const lineIndex = (lineCount + startLineNumber - i - 1) % lineCount;
			const text = model.getLineContent(lineIndex + 1);
			const r = this._findLastMatchInLine(searchRegex, text, lineIndex + 1);
			if (r) {
				return r;
			}
		}

		return null;
	}

	private static _findFirstMatchInLine(searchRegex: RegExp, text: string, lineNumber: number, fromColumn: number): Range {
		// Set regex to search from column
		searchRegex.lastIndex = fromColumn - 1;
		const m: RegExpExecArray = searchRegex.exec(text);
		return m ? new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length) : null;
	}

	private static _findLastMatchInLine(searchRegex: RegExp, text: string, lineNumber: number): Range {
		let bestResult: Range = null;
		let m: RegExpExecArray;
		while ((m = searchRegex.exec(text))) {
			const result = new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length);
			if (result.equalsRange(bestResult)) {
				break;
			}
			bestResult = result;
			if (m.index + m[0].length === text.length) {
				// Reached the end of the line
				break;
			}
		}
		return bestResult;
	}

	private static _findMatchesInLine(searchRegex: RegExp, text: string, lineNumber: number, deltaOffset: number, counter: number, result: Range[], limitResultCount: number): number {
		let m: RegExpExecArray;
		// Reset regex to search from the beginning
		searchRegex.lastIndex = 0;
		do {
			m = searchRegex.exec(text);
			if (m) {
				const range = new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset);
				if (range.equalsRange(result[result.length - 1])) {
					// Exit early if the regex matches the same range
					return counter;
				}
				result.push(range);
				counter++;
				if (counter >= limitResultCount) {
					return counter;
				}
				if (m.index + m[0].length === text.length) {
					// Reached the end of the line
					return counter;
				}
			}
		} while (m);
		return counter;
	}
}