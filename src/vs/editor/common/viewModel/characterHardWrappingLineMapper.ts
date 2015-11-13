/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Strings = require('vs/base/common/strings');
import {ILineMapperFactory, ILineMapping, IOutputPosition} from 'vs/editor/common/viewModel/splitLinesCollection';
import {PrefixSumComputer} from 'vs/editor/common/viewModel/prefixSumComputer';
import EditorCommon = require('vs/editor/common/editorCommon');

var throwawayIndexOfResult = {
	index: -1,
	remainder: -1
};

var BREAK_BEFORE_CLASS = 1;
var BREAK_AFTER_CLASS = 2;
var BREAK_OBTRUSIVE_CLASS = 3;

function buildCharacterClassesMap(BREAK_BEFORE:string, BREAK_AFTER:string, BREAK_OBTRUSIVE:string): number[] {
	var result:number[] = [],
		maxCharCode = 0,
		allBreakingChars = BREAK_BEFORE + BREAK_AFTER + BREAK_OBTRUSIVE,
		i:number;

	for (i = 0; i < allBreakingChars.length; i++) {
		maxCharCode = Math.max(maxCharCode, allBreakingChars.charCodeAt(i));
	}

	for (i = 0; i <= maxCharCode; i++) {
		result[i] = 0;
	}

	for (i = 0; i < BREAK_BEFORE.length; i++) {
		result[BREAK_BEFORE.charCodeAt(i)] = BREAK_BEFORE_CLASS;
	}

	for (i = 0; i < BREAK_AFTER.length; i++) {
		result[BREAK_AFTER.charCodeAt(i)] = BREAK_AFTER_CLASS;
	}

	for (i = 0; i < BREAK_OBTRUSIVE.length; i++) {
		result[BREAK_OBTRUSIVE.charCodeAt(i)] = BREAK_OBTRUSIVE_CLASS;
	}

	return result;
}

export class CharacterHardWrappingLineMapperFactory implements ILineMapperFactory {

	private characterClasses:number[];

	constructor(breakBeforeChars:string, breakAfterChars:string, breakObtrusiveChars:string) {
		this.characterClasses = buildCharacterClassesMap(breakBeforeChars, breakAfterChars, breakObtrusiveChars);
	}

	// TODO@Alex -> duplicated in lineCommentCommand
	private static nextVisibleColumn(currentVisibleColumn:number, tabSize:number, isTab:boolean, columnSize:number): number {
		if (isTab) {
			return currentVisibleColumn + (tabSize - (currentVisibleColumn % tabSize));
		}
		return currentVisibleColumn + columnSize;
	}

	public createLineMapping(lineText: string, tabSize: number, breakingColumn: number, columnsForFullWidthChar:number, hardWrappingIndent:EditorCommon.WrappingIndent): ILineMapping {
		if (breakingColumn === -1) {
			return null;
		}

		var wrappedTextIndentVisibleColumn = 0,
			wrappedTextIndent = '',
			TAB_CHAR_CODE = '\t'.charCodeAt(0);

		if (hardWrappingIndent !== EditorCommon.WrappingIndent.None) {
			var firstNonWhitespaceIndex = Strings.firstNonWhitespaceIndex(lineText);
			if (firstNonWhitespaceIndex !== -1) {
				wrappedTextIndent = lineText.substring(0, firstNonWhitespaceIndex);
				for (var i = 0; i < firstNonWhitespaceIndex; i++) {
					wrappedTextIndentVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(wrappedTextIndentVisibleColumn, tabSize, lineText.charCodeAt(i) === TAB_CHAR_CODE, 1);
				}
				if (hardWrappingIndent === EditorCommon.WrappingIndent.Indent) {
					wrappedTextIndent += '\t';
					wrappedTextIndentVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(wrappedTextIndentVisibleColumn, tabSize, true, 1);
				}
				// Force sticking to beginning of line if indentColumn > 66% breakingColumn
				if (wrappedTextIndentVisibleColumn > 1/2 * breakingColumn) {
					wrappedTextIndent = '';
					wrappedTextIndentVisibleColumn = 0;
				}
			}
		}

		var characterClasses = this.characterClasses,
			lastBreakingOffset = 0, // Last 0-based offset in the lineText at which a break happened
			breakingLengths:number[] = [], // The length of each broken-up line text
			breakingLengthsIndex:number = 0, // The count of breaks already done
			i:number,
			len:number,
			visibleColumn:number, // Visible column since the beginning of the current line
			charCode:number,
			charCodeIsTab:boolean,
			charCodeClass:number,
			breakBeforeOffset:number, // 0-based offset in the lineText before which breaking
			restoreVisibleColumnFrom:number; // visible column used to re-establish a correct `visibleColumn`

		var niceBreakOffset = -1, // Last index of a character that indicates a break should happen before it (more desirable)
			niceBreakVisibleColumn = 0, // visible column if a break were to be later introduced before `niceBreakOffset`
			obtrusiveBreakOffset = -1, // Last index of a character that indicates a break should happen before it (less desirable)
			obtrusiveBreakVisibleColumn = 0; // visible column if a break were to be later introduced before `obtrusiveBreakOffset`

		visibleColumn = 0;
		for (i = 0, len = lineText.length; i < len; i++) {
			// At this point, there is a certainty that the character before `i` fits on the current line,
			// but the character at `i` might not fit

			charCode = lineText.charCodeAt(i);
			charCodeIsTab = (charCode === TAB_CHAR_CODE);
			charCodeClass = charCode < characterClasses.length ? characterClasses[charCode] : 0;

			if (charCodeClass === BREAK_BEFORE_CLASS) {
				// This is a character that indicates that a break should happen before it
				// Since we are certain the character before `i` fits, there's no extra checking needed,
				// just mark it as a nice breaking opportunity
				niceBreakOffset = i;
				niceBreakVisibleColumn = 0;
			}

			// Do a cheap trick to better support wrapping of wide characters, treat them as 2 columns
			// http://jrgraphix.net/research/unicode_blocks.php
			//            2E80 — 2EFF   CJK Radicals Supplement
			//            2F00 — 2FDF   Kangxi Radicals
			//            2FF0 — 2FFF   Ideographic Description Characters
			//            3000 — 303F   CJK Symbols and Punctuation
			//            3040 — 309F   Hiragana
			//            30A0 — 30FF   Katakana
			//            3100 — 312F   Bopomofo
			//            3130 — 318F   Hangul Compatibility Jamo
			//            3190 — 319F   Kanbun
			//            31A0 — 31BF   Bopomofo Extended
			//            31F0 — 31FF   Katakana Phonetic Extensions
			//            3200 — 32FF   Enclosed CJK Letters and Months
			//            3300 — 33FF   CJK Compatibility
			//            3400 — 4DBF   CJK Unified Ideographs Extension A
			//            4DC0 — 4DFF   Yijing Hexagram Symbols
			//            4E00 — 9FFF   CJK Unified Ideographs
			//            A000 — A48F   Yi Syllables
			//            A490 — A4CF   Yi Radicals
			//            AC00 — D7AF   Hangul Syllables
			// [IGNORE] D800 — DB7F   High Surrogates
			// [IGNORE] DB80 — DBFF   High Private Use Surrogates
			// [IGNORE] DC00 — DFFF   Low Surrogates
			// [IGNORE] E000 — F8FF   Private Use Area
			//            F900 — FAFF   CJK Compatibility Ideographs
			// [IGNORE] FB00 — FB4F   Alphabetic Presentation Forms
			// [IGNORE] FB50 — FDFF   Arabic Presentation Forms-A
			// [IGNORE] FE00 — FE0F   Variation Selectors
			// [IGNORE] FE20 — FE2F   Combining Half Marks
			// [IGNORE] FE30 — FE4F   CJK Compatibility Forms
			// [IGNORE] FE50 — FE6F   Small Form Variants
			// [IGNORE] FE70 — FEFF   Arabic Presentation Forms-B
			//            FF00 — FFEF   Halfwidth and Fullwidth Forms
			//               [https://en.wikipedia.org/wiki/Halfwidth_and_fullwidth_forms]
			//               of which FF01 - FF5E fullwidth ASCII of 21 to 7E
			// [IGNORE]    and FF65 - FFDC halfwidth of Katakana and Hangul
			// [IGNORE] FFF0 — FFFF   Specials

			var charColumnSize = 1;
			if (
				(charCode >= 0x2E80 && charCode <= 0xD7AF)
				|| (charCode >= 0xF900 && charCode <= 0xFAFF)
				|| (charCode >= 0xFF01 && charCode <= 0xFF5E)
			) {
				charColumnSize = columnsForFullWidthChar;
			}

			// Advance visibleColumn with character at `i`
			visibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(visibleColumn, tabSize, charCodeIsTab, charColumnSize);

			if (visibleColumn > breakingColumn && i !== 0) {
				// We need to break at least before character at `i`:
				//  - break before niceBreakLastOffset if it exists (and re-establish a correct visibleColumn by using niceBreakVisibleColumn + charAt(i))
				//  - otherwise, break before obtrusiveBreakLastOffset if it exists (and re-establish a correct visibleColumn by using obtrusiveBreakVisibleColumn + charAt(i))
				//  - otherwise, break before i (and re-establish a correct visibleColumn by charAt(i))

				if (niceBreakOffset !== -1) {

					// We will break before `niceBreakLastOffset`
					breakBeforeOffset = niceBreakOffset;
					restoreVisibleColumnFrom = niceBreakVisibleColumn + wrappedTextIndentVisibleColumn;

				} else if (obtrusiveBreakOffset !== -1) {

					// We will break before `obtrusiveBreakLastOffset`
					breakBeforeOffset = obtrusiveBreakOffset;
					restoreVisibleColumnFrom = obtrusiveBreakVisibleColumn + wrappedTextIndentVisibleColumn;

				} else {

					// We will break before `i`
					breakBeforeOffset = i;
					restoreVisibleColumnFrom = 0 + wrappedTextIndentVisibleColumn;

				}

				// Break before character at `breakBeforeOffset`
				breakingLengths[breakingLengthsIndex++] = breakBeforeOffset - lastBreakingOffset;
				lastBreakingOffset = breakBeforeOffset;

				// Re-establish visibleColumn by taking character at `i` into account
				visibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(restoreVisibleColumnFrom, tabSize, charCodeIsTab, charColumnSize);

				// Reset markers
				niceBreakOffset = -1;
				niceBreakVisibleColumn = 0;
				obtrusiveBreakOffset = -1;
				obtrusiveBreakVisibleColumn = 0;
			}

			// At this point, there is a certainty that the character at `i` fits on the current line

			if (niceBreakOffset !== -1) {
				// Advance niceBreakVisibleColumn
				niceBreakVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(niceBreakVisibleColumn, tabSize, charCodeIsTab, charColumnSize);
			}
			if (obtrusiveBreakOffset !== -1) {
				// Advance obtrusiveBreakVisibleColumn
				obtrusiveBreakVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(obtrusiveBreakVisibleColumn, tabSize, charCodeIsTab, charColumnSize);
			}

			if (charCodeClass === BREAK_AFTER_CLASS) {
				// This is a character that indicates that a break should happen after it
				niceBreakOffset = i + 1;
				niceBreakVisibleColumn = 0;
			}

			if (charCodeClass === BREAK_OBTRUSIVE_CLASS) {
				// This is an obtrusive character that indicates that a break should happen after it
				obtrusiveBreakOffset = i + 1;
				obtrusiveBreakVisibleColumn = 0;
			}
		}

		if (breakingLengthsIndex === 0) {
			return null;
		}

		// Add last segment
		breakingLengths[breakingLengthsIndex++] = len - lastBreakingOffset;

		return new CharacterHardWrappingLineMapping(new PrefixSumComputer(breakingLengths), wrappedTextIndent);
	}
}

export class CharacterHardWrappingLineMapping implements ILineMapping {

	private _prefixSums:PrefixSumComputer;
	private _wrappedLinesIndent:string;

	constructor(prefixSums:PrefixSumComputer, wrappedLinesIndent:string) {
		this._prefixSums = prefixSums;
		this._wrappedLinesIndent = wrappedLinesIndent;
	}

	public getOutputLineCount(): number {
		return this._prefixSums.getCount();
	}

	public getWrappedLinesIndent(): string {
		return this._wrappedLinesIndent;
	}

	public getInputOffsetOfOutputPosition(outputLineIndex:number, outputOffset:number): number {
		if (outputLineIndex === 0) {
			return outputOffset;
		} else {
			return this._prefixSums.getAccumulatedValue(outputLineIndex - 1) + outputOffset;
		}
	}

	public getOutputPositionOfInputOffset(inputOffset:number, result:IOutputPosition): void {
		this._prefixSums.getIndexOf(inputOffset, throwawayIndexOfResult);
		result.outputLineIndex = throwawayIndexOfResult.index;
		result.outputOffset = throwawayIndexOfResult.remainder;
	}
}