/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { WrappingIndent, IComputedEditorOptions, EditorOption } from 'vs/editor/common/config/editorOptions';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';
import { ILineMapperFactory, LineBreakingData, ILineMappingComputer } from 'vs/editor/common/viewModel/splitLinesCollection';

const enum CharacterClass {
	NONE = 0,
	BREAK_BEFORE = 1,
	BREAK_AFTER = 2,
	BREAK_IDEOGRAPHIC = 3 // for Han and Kana.
}

class WrappingCharacterClassifier extends CharacterClassifier<CharacterClass> {

	constructor(BREAK_BEFORE: string, BREAK_AFTER: string) {
		super(CharacterClass.NONE);

		for (let i = 0; i < BREAK_BEFORE.length; i++) {
			this.set(BREAK_BEFORE.charCodeAt(i), CharacterClass.BREAK_BEFORE);
		}

		for (let i = 0; i < BREAK_AFTER.length; i++) {
			this.set(BREAK_AFTER.charCodeAt(i), CharacterClass.BREAK_AFTER);
		}
	}

	public get(charCode: number): CharacterClass {
		if (charCode >= 0 && charCode < 256) {
			return <CharacterClass>this._asciiMap[charCode];
		} else {
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

			return <CharacterClass>(this._map.get(charCode) || this._defaultValue);
		}
	}
}

export class CharacterHardWrappingLineMapperFactory implements ILineMapperFactory {

	public static create(options: IComputedEditorOptions): CharacterHardWrappingLineMapperFactory {
		return new CharacterHardWrappingLineMapperFactory(
			options.get(EditorOption.wordWrapBreakBeforeCharacters),
			options.get(EditorOption.wordWrapBreakAfterCharacters)
		);
	}

	private readonly classifier: WrappingCharacterClassifier;

	constructor(breakBeforeChars: string, breakAfterChars: string) {
		this.classifier = new WrappingCharacterClassifier(breakBeforeChars, breakAfterChars);
	}

	public createLineMappingComputer(tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent): ILineMappingComputer {
		tabSize = tabSize | 0; //@perf
		wrappingColumn = +wrappingColumn; //@perf
		columnsForFullWidthChar = +columnsForFullWidthChar; //@perf

		let requests: string[] = [];
		return {
			addRequest: (lineText: string) => {
				requests.push(lineText);
			},
			finalize: () => {
				let result: (LineBreakingData | null)[] = [];
				for (let i = 0, len = requests.length; i < len; i++) {
					result[i] = this._createLineMapping(requests[i], tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
				}
				return result;
			}
		};
	}

	private _createLineMapping(lineText: string, tabSize: number, firstLineBreakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): LineBreakingData | null {
		if (firstLineBreakingColumn === -1) {
			return null;
		}

		let firstNonWhitespaceIndex = -1;
		let wrappedTextIndentLength = 0;
		if (hardWrappingIndent !== WrappingIndent.None) {
			firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineText);
			if (firstNonWhitespaceIndex !== -1) {
				// Track existing indent

				for (let i = 0; i < firstNonWhitespaceIndex; i++) {
					const charWidth = (lineText.charCodeAt(i) === CharCode.Tab ? tabCharacterWidth(wrappedTextIndentLength, tabSize) : 1);
					wrappedTextIndentLength += charWidth;
				}

				// Increase indent of continuation lines, if desired
				const numberOfAdditionalTabs = (hardWrappingIndent === WrappingIndent.DeepIndent ? 2 : hardWrappingIndent === WrappingIndent.Indent ? 1 : 0);
				for (let i = 0; i < numberOfAdditionalTabs; i++) {
					const charWidth = tabCharacterWidth(wrappedTextIndentLength, tabSize);
					wrappedTextIndentLength += charWidth;
				}

				// Force sticking to beginning of line if no character would fit except for the indentation
				if (wrappedTextIndentLength + columnsForFullWidthChar > firstLineBreakingColumn) {
					wrappedTextIndentLength = 0;
				}
			}
		}
		const wrappedLineBreakingColumn = firstLineBreakingColumn - wrappedTextIndentLength;

		const classifier = this.classifier;
		let breakingOffsets: number[] = [];
		let breakingOffsetsVisibleColumn: number[] = [];
		let breakingOffsetsCount: number = 0;
		let visibleColumn = 0;
		let breakOffset = 0;
		let breakOffsetVisibleColumn = 0;
		const len = lineText.length;
		const len1 = len - 1;

		let breakingColumn = firstLineBreakingColumn;
		let prevCharCode = CharCode.Null;
		let prevCharCodeClass = CharacterClass.NONE;
		let charCode = CharCode.Null;
		let charCodeClass = CharacterClass.NONE;
		let nextCharCode = (len > 0 ? lineText.charCodeAt(0) : CharCode.Null);
		let nextCharCodeClass = classifier.get(nextCharCode);

		for (let i = 0; i < len; i++) {
			// At this point, there is a certainty that the character before `i` fits on the current line,
			// but the character at `i` might not fit

			prevCharCode = charCode;
			prevCharCodeClass = charCodeClass;
			charCode = nextCharCode;
			charCodeClass = nextCharCodeClass;
			nextCharCode = (i < len1 ? lineText.charCodeAt(i + 1) : CharCode.Null);
			nextCharCodeClass = classifier.get(nextCharCode);

			if (strings.isLowSurrogate(charCode)) {
				// A surrogate pair must always be considered as a single unit, so it is never to be broken
				visibleColumn += 1;
				continue;
			}

			if (prevCharCode !== CharCode.Null && canBreakBefore(charCodeClass, prevCharCodeClass)) {
				breakOffset = i;
				breakOffsetVisibleColumn = visibleColumn;
			}

			const charColumnSize = (
				charCode === CharCode.Tab
					? tabCharacterWidth(visibleColumn, tabSize)
					: (strings.isFullWidthCharacter(charCode) ? columnsForFullWidthChar : 1)
			);

			visibleColumn += charColumnSize;

			// check if adding character at `i` will go over the breaking column
			if (visibleColumn > breakingColumn && i !== 0) {
				// We need to break at least before character at `i`:

				if (breakOffset === 0 || visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakingColumn) {
					// Cannot break at `breakOffset`, must break at `i`
					breakOffset = i;
					breakOffsetVisibleColumn = visibleColumn - charColumnSize;
				}

				breakingOffsets[breakingOffsetsCount] = breakOffset;
				breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
				breakingOffsetsCount++;
				breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakingColumn;
				breakOffset = 0;
			}

			// At this point, there is a certainty that the character at `i` fits on the current line
			if (nextCharCode !== CharCode.Null && canBreakAfter(charCodeClass, nextCharCodeClass)) {
				breakOffset = i + 1;
				breakOffsetVisibleColumn = visibleColumn;
			}
		}

		if (breakingOffsetsCount === 0) {
			return null;
		}

		// Add last segment
		breakingOffsets[breakingOffsetsCount] = len;
		breakingOffsetsVisibleColumn[breakingOffsetsCount] = visibleColumn;

		return new LineBreakingData(breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
	}
}

function tabCharacterWidth(visibleColumn: number, tabSize: number): number {
	return (tabSize - (visibleColumn % tabSize));
}

function canBreakBefore(charCodeClass: CharacterClass, prevCharCodeClass: CharacterClass): boolean {
	// This is a character that indicates that a break should happen before it
	// (or) CJK breaking : before break : Kinsoku Shori : Don't break after a leading character, like an open bracket
	return (
		(charCodeClass === CharacterClass.BREAK_BEFORE)
		|| (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && prevCharCodeClass !== CharacterClass.BREAK_BEFORE)
	);
}

function canBreakAfter(charCodeClass: CharacterClass, nextCharCodeClass: CharacterClass): boolean {
	// This is a character that indicates that a break should happen after it
	// (or) CJK breaking : after break : Kinsoku Shori : Don't break before a trailing character, like a period
	return (
		(charCodeClass === CharacterClass.BREAK_AFTER)
		|| (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && nextCharCodeClass !== CharacterClass.BREAK_AFTER)
	);
}
