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
		let previousBreakingData: (LineBreakingData | null)[] = [];
		return {
			addRequest: (lineText: string, previousLineBreakingData: LineBreakingData | null) => {
				requests.push(lineText);
				previousBreakingData.push(previousLineBreakingData);
			},
			finalize: () => {
				let result: (LineBreakingData | null)[] = [];
				for (let i = 0, len = requests.length; i < len; i++) {
					result[i] = createLineMapping(this.classifier, previousBreakingData[i], requests[i], tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
				}
				return result;
			}
		};
	}
}

function createLineMapping(classifier: WrappingCharacterClassifier, previousBreakingData: LineBreakingData | null, lineText: string, tabSize: number, firstLineBreakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): LineBreakingData | null {
	if (firstLineBreakingColumn === -1) {
		return null;
	}

	const len = lineText.length;
	if (len <= 1) {
		return null;
	}

	const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakingColumn, columnsForFullWidthChar, hardWrappingIndent);
	const wrappedLineBreakingColumn = firstLineBreakingColumn - wrappedTextIndentLength;

	let breakingOffsets: number[] = [];
	let breakingOffsetsVisibleColumn: number[] = [];
	let breakingOffsetsCount: number = 0;
	let breakOffset = 0;
	let breakOffsetVisibleColumn = 0;

	let breakingColumn = firstLineBreakingColumn;
	let prevCharCode = lineText.charCodeAt(0);
	let prevCharCodeClass = classifier.get(prevCharCode);
	let visibleColumn = computeCharWidth(prevCharCode, 0, tabSize, columnsForFullWidthChar);

	for (let i = 1; i < len; i++) {
		const charCode = lineText.charCodeAt(i);
		const charCodeClass = classifier.get(charCode);

		if (strings.isHighSurrogate(prevCharCode)) {
			// A surrogate pair must always be considered as a single unit, so it is never to be broken
			visibleColumn += 1;
			prevCharCode = charCode;
			prevCharCodeClass = charCodeClass;
			continue;
		}

		if (canBreak(prevCharCodeClass, charCodeClass)) {
			breakOffset = i;
			breakOffsetVisibleColumn = visibleColumn;
		}

		const charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
		visibleColumn += charWidth;

		// check if adding character at `i` will go over the breaking column
		if (visibleColumn > breakingColumn) {
			// We need to break at least before character at `i`:

			if (breakOffset === 0 || visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakingColumn) {
				// Cannot break at `breakOffset`, must break at `i`
				breakOffset = i;
				breakOffsetVisibleColumn = visibleColumn - charWidth;
			}

			breakingOffsets[breakingOffsetsCount] = breakOffset;
			breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
			breakingOffsetsCount++;
			breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakingColumn;
			breakOffset = 0;
		}

		prevCharCode = charCode;
		prevCharCodeClass = charCodeClass;
	}

	if (breakingOffsetsCount === 0) {
		return null;
	}

	// Add last segment
	breakingOffsets[breakingOffsetsCount] = len;
	breakingOffsetsVisibleColumn[breakingOffsetsCount] = visibleColumn;

	return new LineBreakingData(firstLineBreakingColumn, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
}

function computeCharWidth(charCode: number, visibleColumn: number, tabSize: number, columnsForFullWidthChar: number): number {
	if (charCode === CharCode.Tab) {
		return (tabSize - (visibleColumn % tabSize));
	}
	if (strings.isFullWidthCharacter(charCode)) {
		return columnsForFullWidthChar;
	}
	return 1;
}

function tabCharacterWidth(visibleColumn: number, tabSize: number): number {
	return (tabSize - (visibleColumn % tabSize));
}

/**
 * Kinsoku Shori : Don't break after a leading character, like an open bracket
 * Kinsoku Shori : Don't break before a trailing character, like a period
 */
function canBreak(prevCharCodeClass: CharacterClass, charCodeClass: CharacterClass): boolean {
	return (
		(prevCharCodeClass === CharacterClass.BREAK_AFTER)
		|| (prevCharCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && charCodeClass !== CharacterClass.BREAK_AFTER)
		|| (charCodeClass === CharacterClass.BREAK_BEFORE)
		|| (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && prevCharCodeClass !== CharacterClass.BREAK_BEFORE)
	);
}

function computeWrappedTextIndentLength(lineText: string, tabSize: number, firstLineBreakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): number {
	let wrappedTextIndentLength = 0;
	if (hardWrappingIndent !== WrappingIndent.None) {
		const firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineText);
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
	return wrappedTextIndentLength;
}
