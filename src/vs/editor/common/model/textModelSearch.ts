/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { FindMatch, EndOfLinePreference } from 'vs/editor/common/editorCommon';
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

	public parseSearchRequest(): SearchData {
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

		let canUseSimpleSearch = (!this.isRegex && !this.wholeWord && !multiline);
		if (canUseSimpleSearch && this.searchString.toLowerCase() !== this.searchString.toUpperCase()) {
			// casing might make a difference
			canUseSimpleSearch = this.matchCase;
		}

		return new SearchData(regex, canUseSimpleSearch ? this.searchString : null);
	}
}

export class SearchData {

	/**
	 * The regex to search for. Always defined.
	 */
	public readonly regex: RegExp;
	/**
	 * The simple string to search for (if possible).
	 */
	public readonly simpleSearch: string;

	constructor(regex: RegExp, simpleSearch: string) {
		this.regex = regex;
		this.simpleSearch = simpleSearch;
	}
}

function createFindMatch(range: Range, rawMatches: RegExpExecArray, captureMatches: boolean): FindMatch {
	if (!captureMatches) {
		return new FindMatch(range, null);
	}
	let matches: string[] = [];
	for (let i = 0, len = rawMatches.length; i < len; i++) {
		matches[i] = rawMatches[i];
	}
	return new FindMatch(range, matches);
}

export class TextModelSearch {

	public static findMatches(model: TextModel, searchParams: SearchParams, searchRange: Range, captureMatches: boolean, limitResultCount: number): FindMatch[] {
		const searchData = searchParams.parseSearchRequest();
		if (!searchData) {
			return [];
		}

		if (searchData.regex.multiline) {
			return this._doFindMatchesMultiline(model, searchRange, searchData.regex, captureMatches, limitResultCount);
		}
		return this._doFindMatchesLineByLine(model, searchRange, searchData, captureMatches, limitResultCount);
	}

	/**
	 * Multiline search always executes on the lines concatenated with \n.
	 * We must therefore compensate for the count of \n in case the model is CRLF
	 */
	private static _getMultilineMatchRange(model: TextModel, deltaOffset: number, text: string, matchIndex: number, match0: string): Range {
		let startOffset: number;
		if (model.getEOL() === '\r\n') {
			let lineFeedCountBeforeMatch = 0;
			for (let i = 0; i < matchIndex; i++) {
				let chCode = text.charCodeAt(i);
				if (chCode === CharCode.LineFeed) {
					lineFeedCountBeforeMatch++;
				}
			}
			startOffset = deltaOffset + matchIndex + lineFeedCountBeforeMatch /* add as many \r as there were \n */;
		} else {
			startOffset = deltaOffset + matchIndex;
		}

		let endOffset: number;
		if (model.getEOL() === '\r\n') {
			let lineFeedCountInMatch = 0;
			for (let i = 0, len = match0.length; i < len; i++) {
				let chCode = text.charCodeAt(i + matchIndex);
				if (chCode === CharCode.LineFeed) {
					lineFeedCountInMatch++;
				}
			}
			endOffset = startOffset + match0.length + lineFeedCountInMatch /* add as many \r as there were \n */;
		} else {
			endOffset = startOffset + match0.length;
		}

		const startPosition = model.getPositionAt(startOffset);
		const endPosition = model.getPositionAt(endOffset);
		return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
	}

	private static _doFindMatchesMultiline(model: TextModel, searchRange: Range, searchRegex: RegExp, captureMatches: boolean, limitResultCount: number): FindMatch[] {
		const deltaOffset = model.getOffsetAt(searchRange.getStartPosition());
		// We always execute multiline search over the lines joined with \n
		// This makes it that \n will match the EOL for both CRLF and LF models
		// We compensate for offset errors in `_getMultilineMatchRange`
		const text = model.getValueInRange(searchRange, EndOfLinePreference.LF);

		const result: FindMatch[] = [];
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

			result[counter++] = createFindMatch(
				this._getMultilineMatchRange(model, deltaOffset, text, m.index, m[0]),
				m,
				captureMatches
			);
			if (counter >= limitResultCount) {
				return result;
			}

			prevStartOffset = startOffset;
			prevEndOffset = endOffset;
		}

		return result;
	}

	private static _doFindMatchesLineByLine(model: TextModel, searchRange: Range, searchData: SearchData, captureMatches: boolean, limitResultCount: number): FindMatch[] {
		const result: FindMatch[] = [];
		let resultLen = 0;

		// Early case for a search range that starts & stops on the same line number
		if (searchRange.startLineNumber === searchRange.endLineNumber) {
			const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1, searchRange.endColumn - 1);
			resultLen = this._findMatchesInLine(searchData, text, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount);
			return result;
		}

		// Collect results from first line
		const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1);
		resultLen = this._findMatchesInLine(searchData, text, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount);

		// Collect results from middle lines
		for (let lineNumber = searchRange.startLineNumber + 1; lineNumber < searchRange.endLineNumber && resultLen < limitResultCount; lineNumber++) {
			resultLen = this._findMatchesInLine(searchData, model.getLineContent(lineNumber), lineNumber, 0, resultLen, result, captureMatches, limitResultCount);
		}

		// Collect results from last line
		if (resultLen < limitResultCount) {
			const text = model.getLineContent(searchRange.endLineNumber).substring(0, searchRange.endColumn - 1);
			resultLen = this._findMatchesInLine(searchData, text, searchRange.endLineNumber, 0, resultLen, result, captureMatches, limitResultCount);
		}

		return result;
	}

	private static _findMatchesInLine(searchData: SearchData, text: string, lineNumber: number, deltaOffset: number, resultLen: number, result: FindMatch[], captureMatches: boolean, limitResultCount: number): number {
		if (!captureMatches && searchData.simpleSearch) {
			const searchString = searchData.simpleSearch;
			const searchStringLen = searchString.length;

			let lastMatchIndex = -searchStringLen;
			while ((lastMatchIndex = text.indexOf(searchString, lastMatchIndex + searchStringLen)) !== -1) {
				const range = new Range(lineNumber, lastMatchIndex + 1 + deltaOffset, lineNumber, lastMatchIndex + 1 + searchStringLen + deltaOffset);
				result[resultLen++] = new FindMatch(range, null);
				if (resultLen >= limitResultCount) {
					return resultLen;
				}
			}
			return resultLen;
		}

		const searchRegex = searchData.regex;
		let m: RegExpExecArray;
		// Reset regex to search from the beginning
		searchRegex.lastIndex = 0;
		do {
			m = searchRegex.exec(text);
			if (m) {
				const range = new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset);
				if (result.length > 0 && range.equalsRange(result[result.length - 1].range)) {
					// Exit early if the regex matches the same range
					return resultLen;
				}
				result[resultLen++] = createFindMatch(range, m, captureMatches);
				if (resultLen >= limitResultCount) {
					return resultLen;
				}
				if (m.index + m[0].length === text.length) {
					// Reached the end of the line
					return resultLen;
				}
			}
		} while (m);
		return resultLen;
	}

	public static findNextMatch(model: TextModel, searchParams: SearchParams, searchStart: Position, captureMatches: boolean): FindMatch {
		const searchData = searchParams.parseSearchRequest();
		if (!searchData) {
			return null;
		}

		if (searchData.regex.multiline) {
			return this._doFindNextMatchMultiline(model, searchStart, searchData.regex, captureMatches);
		}
		return this._doFindNextMatchLineByLine(model, searchStart, searchData.regex, captureMatches);
	}

	private static _doFindNextMatchMultiline(model: TextModel, searchStart: Position, searchRegex: RegExp, captureMatches: boolean): FindMatch {
		const searchTextStart = new Position(searchStart.lineNumber, 1);
		const deltaOffset = model.getOffsetAt(searchTextStart);
		const lineCount = model.getLineCount();
		// We always execute multiline search over the lines joined with \n
		// This makes it that \n will match the EOL for both CRLF and LF models
		// We compensate for offset errors in `_getMultilineMatchRange`
		const text = model.getValueInRange(new Range(searchTextStart.lineNumber, searchTextStart.column, lineCount, model.getLineMaxColumn(lineCount)), EndOfLinePreference.LF);
		searchRegex.lastIndex = searchStart.column - 1;
		let m = searchRegex.exec(text);
		if (m) {
			return createFindMatch(
				this._getMultilineMatchRange(model, deltaOffset, text, m.index, m[0]),
				m,
				captureMatches
			);
		}

		if (searchStart.lineNumber !== 1 || searchStart.column !== 1) {
			// Try again from the top
			return this._doFindNextMatchMultiline(model, new Position(1, 1), searchRegex, captureMatches);
		}

		return null;
	}

	private static _doFindNextMatchLineByLine(model: TextModel, searchStart: Position, searchRegex: RegExp, captureMatches: boolean): FindMatch {
		const lineCount = model.getLineCount();
		const startLineNumber = searchStart.lineNumber;

		// Look in first line
		const text = model.getLineContent(startLineNumber);
		const r = this._findFirstMatchInLine(searchRegex, text, startLineNumber, searchStart.column, captureMatches);
		if (r) {
			return r;
		}

		for (let i = 1; i <= lineCount; i++) {
			const lineIndex = (startLineNumber + i - 1) % lineCount;
			const text = model.getLineContent(lineIndex + 1);
			const r = this._findFirstMatchInLine(searchRegex, text, lineIndex + 1, 1, captureMatches);
			if (r) {
				return r;
			}
		}

		return null;
	}

	private static _findFirstMatchInLine(searchRegex: RegExp, text: string, lineNumber: number, fromColumn: number, captureMatches: boolean): FindMatch {
		// Set regex to search from column
		searchRegex.lastIndex = fromColumn - 1;
		const m: RegExpExecArray = searchRegex.exec(text);
		if (m) {
			return createFindMatch(
				new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length),
				m,
				captureMatches
			);
		}
		return null;
	}

	public static findPreviousMatch(model: TextModel, searchParams: SearchParams, searchStart: Position, captureMatches: boolean): FindMatch {
		const searchData = searchParams.parseSearchRequest();
		if (!searchData) {
			return null;
		}

		if (searchData.regex.multiline) {
			return this._doFindPreviousMatchMultiline(model, searchStart, searchData.regex, captureMatches);
		}
		return this._doFindPreviousMatchLineByLine(model, searchStart, searchData.regex, captureMatches);
	}

	private static _doFindPreviousMatchMultiline(model: TextModel, searchStart: Position, searchRegex: RegExp, captureMatches: boolean): FindMatch {
		const matches = this._doFindMatchesMultiline(model, new Range(1, 1, searchStart.lineNumber, searchStart.column), searchRegex, captureMatches, 10 * LIMIT_FIND_COUNT);
		if (matches.length > 0) {
			return matches[matches.length - 1];
		}

		const lineCount = model.getLineCount();
		if (searchStart.lineNumber !== lineCount || searchStart.column !== model.getLineMaxColumn(lineCount)) {
			// Try again with all content
			return this._doFindPreviousMatchMultiline(model, new Position(lineCount, model.getLineMaxColumn(lineCount)), searchRegex, captureMatches);
		}

		return null;
	}

	private static _doFindPreviousMatchLineByLine(model: TextModel, searchStart: Position, searchRegex: RegExp, captureMatches: boolean): FindMatch {
		const lineCount = model.getLineCount();
		const startLineNumber = searchStart.lineNumber;

		// Look in first line
		const text = model.getLineContent(startLineNumber).substring(0, searchStart.column - 1);
		const r = this._findLastMatchInLine(searchRegex, text, startLineNumber, captureMatches);
		if (r) {
			return r;
		}

		for (let i = 1; i <= lineCount; i++) {
			const lineIndex = (lineCount + startLineNumber - i - 1) % lineCount;
			const text = model.getLineContent(lineIndex + 1);
			const r = this._findLastMatchInLine(searchRegex, text, lineIndex + 1, captureMatches);
			if (r) {
				return r;
			}
		}

		return null;
	}

	private static _findLastMatchInLine(searchRegex: RegExp, text: string, lineNumber: number, captureMatches: boolean): FindMatch {
		let bestResult: FindMatch = null;
		let m: RegExpExecArray;
		while ((m = searchRegex.exec(text))) {
			const result = new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length);
			if (bestResult && result.equalsRange(bestResult.range)) {
				break;
			}
			bestResult = createFindMatch(result, m, captureMatches);
			if (m.index + m[0].length === text.length) {
				// Reached the end of the line
				break;
			}
		}
		return bestResult;
	}
}
