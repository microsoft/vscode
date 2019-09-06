/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { WrappingIndent } from 'vs/editor/common/config/editorOptions';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';
import { toUint32Array } from 'vs/editor/common/core/uint';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ILineMapperFactory, ILineMapping, OutputPosition } from 'vs/editor/common/viewModel/splitLinesCollection';

const enum CharacterClass {
	NONE = 0,
	BREAK_BEFORE = 1,
	BREAK_AFTER = 2,
	BREAK_OBTRUSIVE = 3,
	BREAK_IDEOGRAPHIC = 4 // for Han and Kana.
}

class WrappingCharacterClassifier extends CharacterClassifier<CharacterClass> {

	constructor(BREAK_BEFORE: string, BREAK_AFTER: string, BREAK_OBTRUSIVE: string) {
		super(CharacterClass.NONE);

		for (let i = 0; i < BREAK_BEFORE.length; i++) {
			this.set(BREAK_BEFORE.charCodeAt(i), CharacterClass.BREAK_BEFORE);
		}

		for (let i = 0; i < BREAK_AFTER.length; i++) {
			this.set(BREAK_AFTER.charCodeAt(i), CharacterClass.BREAK_AFTER);
		}

		for (let i = 0; i < BREAK_OBTRUSIVE.length; i++) {
			this.set(BREAK_OBTRUSIVE.charCodeAt(i), CharacterClass.BREAK_OBTRUSIVE);
		}
	}

	public get(charCode: number): CharacterClass {
		// Initialize CharacterClass.BREAK_IDEOGRAPHIC for these Unicode ranges:
		// 1. CJK Unified Ideographs (0x4E00 -- 0x9FFF)
		// 2. CJK Unified Ideographs Extension A (0x3400 -- 0x4DBF)
		// 3. Hiragana and Katakana (0x3040 -- 0x30FF)
		if (
			(charCode >= 0x3040 && charCode <= 0x30FF)
			|| (charCode >= 0x3400 && charCode <= 0x4DBF)
			|| (charCode >= 0x4E00 && charCode <= 0x9FFF)
		) {
			return CharacterClass.BREAK_IDEOGRAPHIC;
		}

		return super.get(charCode);
	}
}

export class CharacterHardWrappingLineMapperFactory implements ILineMapperFactory {

	private readonly classifier: WrappingCharacterClassifier;

	constructor(breakBeforeChars: string, breakAfterChars: string, breakObtrusiveChars: string) {
		this.classifier = new WrappingCharacterClassifier(breakBeforeChars, breakAfterChars, breakObtrusiveChars);
	}

	// TODO@Alex -> duplicated in lineCommentCommand
	private static nextVisibleColumn(currentVisibleColumn: number, tabSize: number, isTab: boolean, columnSize: number): number {
		currentVisibleColumn = +currentVisibleColumn; //@perf
		tabSize = +tabSize; //@perf
		columnSize = +columnSize; //@perf

		if (isTab) {
			return currentVisibleColumn + (tabSize - (currentVisibleColumn % tabSize));
		}
		return currentVisibleColumn + columnSize;
	}

	public createLineMapping(lineText: string, tabSize: number, breakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): ILineMapping | null {
		if (breakingColumn === -1) {
			return null;
		}

		tabSize = +tabSize; //@perf
		breakingColumn = +breakingColumn; //@perf
		columnsForFullWidthChar = +columnsForFullWidthChar; //@perf
		hardWrappingIndent = +hardWrappingIndent; //@perf

		let wrappedTextIndentVisibleColumn = 0;
		let wrappedTextIndent = '';

		let firstNonWhitespaceIndex = -1;
		if (hardWrappingIndent !== WrappingIndent.None) {
			firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineText);
			if (firstNonWhitespaceIndex !== -1) {
				// Track existing indent
				wrappedTextIndent = lineText.substring(0, firstNonWhitespaceIndex);
				for (let i = 0; i < firstNonWhitespaceIndex; i++) {
					wrappedTextIndentVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(wrappedTextIndentVisibleColumn, tabSize, lineText.charCodeAt(i) === CharCode.Tab, 1);
				}

				// Increase indent of continuation lines, if desired
				let numberOfAdditionalTabs = 0;
				if (hardWrappingIndent === WrappingIndent.Indent) {
					numberOfAdditionalTabs = 1;
				} else if (hardWrappingIndent === WrappingIndent.DeepIndent) {
					numberOfAdditionalTabs = 2;
				}
				for (let i = 0; i < numberOfAdditionalTabs; i++) {
					wrappedTextIndent += '\t';
					wrappedTextIndentVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(wrappedTextIndentVisibleColumn, tabSize, true, 1);
				}

				// Force sticking to beginning of line if no character would fit except for the indentation
				if (wrappedTextIndentVisibleColumn + columnsForFullWidthChar > breakingColumn) {
					wrappedTextIndent = '';
					wrappedTextIndentVisibleColumn = 0;
				}
			}
		}

		let classifier = this.classifier;
		let lastBreakingOffset = 0; // Last 0-based offset in the lineText at which a break happened
		let breakingLengths: number[] = []; // The length of each broken-up line text
		let breakingLengthsIndex: number = 0; // The count of breaks already done
		let visibleColumn = 0; // Visible column since the beginning of the current line
		let niceBreakOffset = -1; // Last index of a character that indicates a break should happen before it (more desirable)
		let niceBreakVisibleColumn = 0; // visible column if a break were to be later introduced before `niceBreakOffset`
		let obtrusiveBreakOffset = -1; // Last index of a character that indicates a break should happen before it (less desirable)
		let obtrusiveBreakVisibleColumn = 0; // visible column if a break were to be later introduced before `obtrusiveBreakOffset`
		let len = lineText.length;

		for (let i = 0; i < len; i++) {
			// At this point, there is a certainty that the character before `i` fits on the current line,
			// but the character at `i` might not fit

			let charCode = lineText.charCodeAt(i);
			let charCodeIsTab = (charCode === CharCode.Tab);
			let charCodeClass = classifier.get(charCode);

			if (strings.isLowSurrogate(charCode)/*  && i + 1 < len */) {
				// A surrogate pair must always be considered as a single unit, so it is never to be broken
				// => advance visibleColumn by 1 and advance to next char code...
				visibleColumn = visibleColumn + 1;
				continue;
			}

			if (charCodeClass === CharacterClass.BREAK_BEFORE) {
				// This is a character that indicates that a break should happen before it
				// Since we are certain the character before `i` fits, there's no extra checking needed,
				// just mark it as a nice breaking opportunity
				niceBreakOffset = i;
				niceBreakVisibleColumn = wrappedTextIndentVisibleColumn;
			}

			// CJK breaking : before break
			if (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && i > 0) {
				let prevCode = lineText.charCodeAt(i - 1);
				let prevClass = classifier.get(prevCode);
				if (prevClass !== CharacterClass.BREAK_BEFORE) { // Kinsoku Shori: Don't break after a leading character, like an open bracket
					niceBreakOffset = i;
					niceBreakVisibleColumn = wrappedTextIndentVisibleColumn;
				}
			}

			let charColumnSize = 1;
			if (strings.isFullWidthCharacter(charCode)) {
				charColumnSize = columnsForFullWidthChar;
			}

			// Advance visibleColumn with character at `i`
			visibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(visibleColumn, tabSize, charCodeIsTab, charColumnSize);

			if (visibleColumn > breakingColumn && i !== 0) {
				// We need to break at least before character at `i`:
				//  - break before niceBreakLastOffset if it exists (and re-establish a correct visibleColumn by using niceBreakVisibleColumn + charAt(i))
				//  - otherwise, break before obtrusiveBreakLastOffset if it exists (and re-establish a correct visibleColumn by using obtrusiveBreakVisibleColumn + charAt(i))
				//  - otherwise, break before i (and re-establish a correct visibleColumn by charAt(i))

				let breakBeforeOffset: number;
				let restoreVisibleColumnFrom: number;

				if (niceBreakOffset !== -1 && niceBreakVisibleColumn <= breakingColumn) {

					// We will break before `niceBreakLastOffset`
					breakBeforeOffset = niceBreakOffset;
					restoreVisibleColumnFrom = niceBreakVisibleColumn;

				} else if (obtrusiveBreakOffset !== -1 && obtrusiveBreakVisibleColumn <= breakingColumn) {

					// We will break before `obtrusiveBreakLastOffset`
					breakBeforeOffset = obtrusiveBreakOffset;
					restoreVisibleColumnFrom = obtrusiveBreakVisibleColumn;

				} else {

					// We will break before `i`
					breakBeforeOffset = i;
					restoreVisibleColumnFrom = wrappedTextIndentVisibleColumn;

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

			if (charCodeClass === CharacterClass.BREAK_AFTER && (hardWrappingIndent === WrappingIndent.None || i >= firstNonWhitespaceIndex)) {
				// This is a character that indicates that a break should happen after it
				niceBreakOffset = i + 1;
				niceBreakVisibleColumn = wrappedTextIndentVisibleColumn;
			}

			// CJK breaking : after break
			if (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && i < len - 1) {
				let nextCode = lineText.charCodeAt(i + 1);
				let nextClass = classifier.get(nextCode);
				if (nextClass !== CharacterClass.BREAK_AFTER) { // Kinsoku Shori: Don't break before a trailing character, like a period
					niceBreakOffset = i + 1;
					niceBreakVisibleColumn = wrappedTextIndentVisibleColumn;
				}
			}

			if (charCodeClass === CharacterClass.BREAK_OBTRUSIVE) {
				// This is an obtrusive character that indicates that a break should happen after it
				obtrusiveBreakOffset = i + 1;
				obtrusiveBreakVisibleColumn = wrappedTextIndentVisibleColumn;
			}
		}

		if (breakingLengthsIndex === 0) {
			return null;
		}

		// Add last segment
		breakingLengths[breakingLengthsIndex++] = len - lastBreakingOffset;

		return new CharacterHardWrappingLineMapping(
			new PrefixSumComputer(toUint32Array(breakingLengths)),
			wrappedTextIndent
		);
	}
}

export class CharacterHardWrappingLineMapping implements ILineMapping {

	private readonly _prefixSums: PrefixSumComputer;
	private readonly _wrappedLinesIndent: string;

	constructor(prefixSums: PrefixSumComputer, wrappedLinesIndent: string) {
		this._prefixSums = prefixSums;
		this._wrappedLinesIndent = wrappedLinesIndent;
	}

	public getOutputLineCount(): number {
		return this._prefixSums.getCount();
	}

	public getWrappedLinesIndent(): string {
		return this._wrappedLinesIndent;
	}

	public getInputOffsetOfOutputPosition(outputLineIndex: number, outputOffset: number): number {
		if (outputLineIndex === 0) {
			return outputOffset;
		} else {
			return this._prefixSums.getAccumulatedValue(outputLineIndex - 1) + outputOffset;
		}
	}

	public getOutputPositionOfInputOffset(inputOffset: number): OutputPosition {
		let r = this._prefixSums.getIndexOf(inputOffset);
		return new OutputPosition(r.index, r.remainder);
	}
}
