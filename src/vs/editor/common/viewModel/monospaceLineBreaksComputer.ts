/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { WrappingIndent, IComputedEditorOptions, EditorOption } from '../config/editorOptions.js';
import { CharacterClassifier } from '../core/characterClassifier.js';
import { FontInfo } from '../config/fontInfo.js';
import { LineFontSegment, LineInjectedText } from '../textModelEvents.js';
import { InjectedTextOptions } from '../model.js';
import { ILineBreaksComputerFactory, ILineBreaksComputer, ModelLineProjectionData } from '../modelLineProjectionData.js';
import { binarySearch2 } from '../../../base/common/arrays.js';

export class MonospaceLineBreaksComputerFactory implements ILineBreaksComputerFactory {
	public static create(options: IComputedEditorOptions): MonospaceLineBreaksComputerFactory {
		return new MonospaceLineBreaksComputerFactory(
			options.get(EditorOption.wordWrapBreakBeforeCharacters),
			options.get(EditorOption.wordWrapBreakAfterCharacters)
		);
	}

	private readonly classifier: WrappingCharacterClassifier;

	constructor(breakBeforeChars: string, breakAfterChars: string) {
		this.classifier = new WrappingCharacterClassifier(breakBeforeChars, breakAfterChars);
	}

	public createLineBreaksComputer(defaultFontInfo: FontInfo, tabSize: number, wrappingColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll'): ILineBreaksComputer {
		const ranges: { fromLineNumber: number; toLineNumber: number }[] = [];
		const resolvedFontSegments: LineFontSegment[][] = [];
		const requests: string[] = [];
		const injectedTexts: (LineInjectedText[] | null)[] = [];
		const previousBreakingData: (ModelLineProjectionData | null)[] = [];
		return {
			addRequest: (fromLineNumber: number, toLineNumber: number, lineText: string, fontSegments: LineFontSegment[], injectedText: LineInjectedText[] | null, previousLineBreakData: ModelLineProjectionData | null) => {
				ranges.push({ fromLineNumber, toLineNumber });
				requests.push(lineText);
				resolvedFontSegments.push(fontSegments);
				injectedTexts.push(injectedText);
				previousBreakingData.push(previousLineBreakData);
			},
			finalize: () => {
				const result: (ModelLineProjectionData | null)[] = [];
				for (let i = 0, len = requests.length; i < len; i++) {
					const injectedText = injectedTexts[i];
					const previousLineBreakData = previousBreakingData[i];
					const resolvedFontSegment = resolvedFontSegments[i];
					if (previousLineBreakData && !previousLineBreakData.injectionOptions && !injectedText) {
						result[i] = createLineBreaksFromPreviousLineBreaks(this.classifier, previousLineBreakData, requests[i], defaultFontInfo, resolvedFontSegment, tabSize, wrappingColumn, wrappingIndent, wordBreak);
					} else {
						result[i] = createLineBreaks(this.classifier, ranges[i], requests[i], defaultFontInfo, resolvedFontSegment, injectedText, tabSize, wrappingColumn, wrappingIndent, wordBreak);
					}
				}
				arrPool1.length = 0;
				arrPool2.length = 0;
				return result;
			}
		};
	}
}

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

	public override get(charCode: number): CharacterClass {
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

let arrPool1: number[] = [];
let arrPool2: number[] = [];

function createLineBreaksFromPreviousLineBreaks(classifier: WrappingCharacterClassifier, previousBreakingData: ModelLineProjectionData, lineText: string, defaultFontInfo: FontInfo, fontSegments: LineFontSegment[], tabSize: number, firstLineBreakColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll'): ModelLineProjectionData | null {
	console.log('createLineBreaksFromPreviousLineBreaks');
	if (firstLineBreakColumn === -1) {
		return null;
	}

	const len = lineText.length;
	if (len <= 1) {
		return null;
	}

	const isKeepAll = (wordBreak === 'keepAll');

	const prevBreakingOffsets = previousBreakingData.breakOffsets;
	const prevBreakingOffsetsVisibleColumn = previousBreakingData.breakOffsetsVisibleColumn;

	const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, fontSegments, defaultFontInfo, tabSize, firstLineBreakColumn, wrappingIndent);
	const wrappedLineBreakColumn = firstLineBreakColumn - wrappedTextIndentLength;

	const breakingOffsets: number[] = arrPool1;
	const breakingOffsetsVisibleColumn: number[] = arrPool2;
	let breakingOffsetsCount = 0;
	let lastBreakingOffset = 0;
	let lastBreakingOffsetVisibleColumn = 0;

	let breakingColumn = firstLineBreakColumn;
	const prevLen = prevBreakingOffsets.length;
	let prevIndex = 0;

	if (prevIndex >= 0) {
		let bestDistance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
		while (prevIndex + 1 < prevLen) {
			const distance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
			if (distance >= bestDistance) {
				break;
			}
			bestDistance = distance;
			prevIndex++;
		}
	}

	while (prevIndex < prevLen) {
		// Allow for prevIndex to be -1 (for the case where we hit a tab when walking backwards from the first break)
		let prevBreakOffset = prevIndex < 0 ? 0 : prevBreakingOffsets[prevIndex];
		let prevBreakOffsetVisibleColumn = prevIndex < 0 ? 0 : prevBreakingOffsetsVisibleColumn[prevIndex];
		if (lastBreakingOffset > prevBreakOffset) {
			prevBreakOffset = lastBreakingOffset;
			prevBreakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn;
		}

		let breakOffset = 0;
		let breakOffsetVisibleColumn = 0;

		let forcedBreakOffset = 0;
		let forcedBreakOffsetVisibleColumn = 0;

		// initially, we search as much as possible to the right (if it fits)
		if (prevBreakOffsetVisibleColumn <= breakingColumn) {
			let visibleColumn = prevBreakOffsetVisibleColumn;
			let visibleWidth = prevBreakOffsetVisibleColumn * defaultFontInfo.typicalFullwidthCharacterWidth;
			let prevCharCode = prevBreakOffset === 0 ? CharCode.Null : lineText.charCodeAt(prevBreakOffset - 1);
			let prevCharCodeClass = prevBreakOffset === 0 ? CharacterClass.NONE : classifier.get(prevCharCode);
			let entireLineFits = true;
			for (let i = prevBreakOffset; i < len; i++) {
				const charStartOffset = i;
				const charCode = lineText.charCodeAt(i);
				let charCodeClass: number;
				let charWidth: number;
				let colWidth: number;

				const { columnWidth, characterWidth } = computeCharWidth(i, lineText, fontSegments, defaultFontInfo, visibleColumn, tabSize);
				if (strings.isHighSurrogate(charCode)) {
					// A surrogate pair must always be considered as a single unit, so it is never to be broken
					i++;
					charCodeClass = CharacterClass.NONE;
					colWidth = 2;
					charWidth = 2 * characterWidth;
				} else {
					charCodeClass = classifier.get(charCode);
					colWidth = columnWidth;
					charWidth = characterWidth;
				}

				if (charStartOffset > lastBreakingOffset && canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
					breakOffset = charStartOffset;
					breakOffsetVisibleColumn = visibleColumn;
				}

				visibleColumn += colWidth;
				visibleWidth += charWidth;

				// check if adding character at `i` will go over the breaking column
				if (visibleWidth > breakingColumn * defaultFontInfo.typicalFullwidthCharacterWidth) {
					// We need to break at least before character at `i`:
					if (charStartOffset > lastBreakingOffset) {
						forcedBreakOffset = charStartOffset;
						forcedBreakOffsetVisibleColumn = visibleColumn - colWidth;
					} else {
						// we need to advance at least by one character
						forcedBreakOffset = i + 1;
						forcedBreakOffsetVisibleColumn = visibleColumn;
					}

					if (visibleWidth - breakOffsetVisibleColumn * defaultFontInfo.typicalFullwidthCharacterWidth > wrappedLineBreakColumn * defaultFontInfo.typicalFullwidthCharacterWidth) {
						// Cannot break at `breakOffset` => reset it if it was set
						breakOffset = 0;
					}

					entireLineFits = false;
					break;
				}

				prevCharCode = charCode;
				prevCharCodeClass = charCodeClass;
			}

			if (entireLineFits) {
				// there is no more need to break => stop the outer loop!
				if (breakingOffsetsCount > 0) {
					// Add last segment, no need to assign to `lastBreakingOffset` and `lastBreakingOffsetVisibleColumn`
					breakingOffsets[breakingOffsetsCount] = prevBreakingOffsets[prevBreakingOffsets.length - 1];
					breakingOffsetsVisibleColumn[breakingOffsetsCount] = prevBreakingOffsetsVisibleColumn[prevBreakingOffsets.length - 1];
					breakingOffsetsCount++;
				}
				break;
			}
		}

		if (breakOffset === 0) {
			// must search left
			let visibleColumn = prevBreakOffsetVisibleColumn;
			let charCode = lineText.charCodeAt(prevBreakOffset);
			let charCodeClass = classifier.get(charCode);
			let hitATabCharacter = false;
			for (let i = prevBreakOffset - 1; i >= lastBreakingOffset; i--) {
				const charStartOffset = i + 1;
				const prevCharCode = lineText.charCodeAt(i);

				if (prevCharCode === CharCode.Tab) {
					// cannot determine the width of a tab when going backwards, so we must go forwards
					hitATabCharacter = true;
					break;
				}

				let prevCharCodeClass: number;
				let prevCharWidth: number;

				const { characterWidth, columnWidth } = computeCharWidth(i, lineText, fontSegments, defaultFontInfo, visibleColumn, tabSize);
				if (strings.isLowSurrogate(prevCharCode)) {
					// A surrogate pair must always be considered as a single unit, so it is never to be broken
					i--;
					prevCharCodeClass = CharacterClass.NONE;
					prevCharWidth = 2 * characterWidth;
				} else {
					prevCharCodeClass = classifier.get(prevCharCode);
					prevCharWidth = characterWidth;
				}

				if (visibleColumn <= breakingColumn * defaultFontInfo.typicalFullwidthCharacterWidth) {
					if (forcedBreakOffset === 0) {
						forcedBreakOffset = charStartOffset;
						forcedBreakOffsetVisibleColumn = visibleColumn;
					}

					if (visibleColumn <= breakingColumn - wrappedLineBreakColumn) {
						// went too far!
						break;
					}

					if (canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
						breakOffset = charStartOffset;
						breakOffsetVisibleColumn = visibleColumn;
						break;
					}
				}

				visibleColumn -= prevCharWidth;
				charCode = prevCharCode;
				charCodeClass = prevCharCodeClass;
			}

			if (breakOffset !== 0) {
				const remainingWidthOfNextLine = wrappedLineBreakColumn - (forcedBreakOffsetVisibleColumn - breakOffsetVisibleColumn);
				if (remainingWidthOfNextLine <= tabSize) {
					const charCodeAtForcedBreakOffset = lineText.charCodeAt(forcedBreakOffset);
					let charWidth: number;
					const typicalFullwidthCharacterWidth = computeCharWidth(forcedBreakOffset, fontSegments, defaultFontInfo);
					if (strings.isHighSurrogate(charCodeAtForcedBreakOffset)) {
						// A surrogate pair must always be considered as a single unit, so it is never to be broken
						charWidth = 2 * typicalFullwidthCharacterWidth;
					} else {
						charWidth = typicalFullwidthCharacterWidth;
					}
					if (remainingWidthOfNextLine - charWidth < 0) {
						// it is not worth it to break at breakOffset, it just introduces an extra needless line!
						breakOffset = 0;
					}
				}
			}

			if (hitATabCharacter) {
				// cannot determine the width of a tab when going backwards, so we must go forwards from the previous break
				prevIndex--;
				continue;
			}
		}

		if (breakOffset === 0) {
			// Could not find a good breaking point
			breakOffset = forcedBreakOffset;
			breakOffsetVisibleColumn = forcedBreakOffsetVisibleColumn;
		}

		if (breakOffset <= lastBreakingOffset) {
			// Make sure that we are advancing (at least one character)
			const charCode = lineText.charCodeAt(lastBreakingOffset);
			const typicalFullwidthCharacterWidth = computeCharWidth(lastBreakingOffset, fontSegments, defaultFontInfo);
			if (strings.isHighSurrogate(charCode)) {
				// A surrogate pair must always be considered as a single unit, so it is never to be broken
				breakOffset = lastBreakingOffset + 2;
				breakOffsetVisibleColumn = (lastBreakingOffsetVisibleColumn + 2) * typicalFullwidthCharacterWidth;
			} else {
				breakOffset = lastBreakingOffset + 1;
				breakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn * typicalFullwidthCharacterWidth;
			}
		}

		lastBreakingOffset = breakOffset;
		breakingOffsets[breakingOffsetsCount] = breakOffset;
		lastBreakingOffsetVisibleColumn = breakOffsetVisibleColumn;
		breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
		breakingOffsetsCount++;
		breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakColumn;

		while (prevIndex < 0 || (prevIndex < prevLen && prevBreakingOffsetsVisibleColumn[prevIndex] < breakOffsetVisibleColumn)) {
			prevIndex++;
		}

		let bestDistance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
		while (prevIndex + 1 < prevLen) {
			const distance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
			if (distance >= bestDistance) {
				break;
			}
			bestDistance = distance;
			prevIndex++;
		}
	}

	if (breakingOffsetsCount === 0) {
		return null;
	}

	// Doing here some object reuse which ends up helping a huge deal with GC pauses!
	breakingOffsets.length = breakingOffsetsCount;
	breakingOffsetsVisibleColumn.length = breakingOffsetsCount;
	arrPool1 = previousBreakingData.breakOffsets;
	arrPool2 = previousBreakingData.breakOffsetsVisibleColumn;
	previousBreakingData.breakOffsets = breakingOffsets;
	previousBreakingData.breakOffsetsVisibleColumn = breakingOffsetsVisibleColumn;
	previousBreakingData.wrappedTextIndentLength = wrappedTextIndentLength;
	return previousBreakingData;
}

function createLineBreaks(classifier: WrappingCharacterClassifier, range: { fromLineNumber: number; toLineNumber: number }, _lineText: string, defaultFontInfo: FontInfo, fontSegments: LineFontSegment[], injectedTexts: LineInjectedText[] | null, tabSize: number, firstLineBreakColumn: number, wrappingIndent: WrappingIndent, wordBreak: 'normal' | 'keepAll'): ModelLineProjectionData | null {
	const lineText = LineInjectedText.applyInjectedText(_lineText, injectedTexts);

	let injectionOptions: InjectedTextOptions[] | null;
	let injectionOffsets: number[] | null;
	if (injectedTexts && injectedTexts.length > 0) {
		injectionOptions = injectedTexts.map(t => t.options);
		injectionOffsets = injectedTexts.map(text => text.column - 1);
	} else {
		injectionOptions = null;
		injectionOffsets = null;
	}

	if (firstLineBreakColumn === -1) {
		if (!injectionOptions) {
			return null;
		}
		// creating a `LineBreakData` with an invalid `breakOffsetsVisibleColumn` is OK
		// because `breakOffsetsVisibleColumn` will never be used because it contains injected text
		return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
	}

	const len = lineText.length;
	if (len <= 1) {
		if (!injectionOptions) {
			return null;
		}
		// creating a `LineBreakData` with an invalid `breakOffsetsVisibleColumn` is OK
		// because `breakOffsetsVisibleColumn` will never be used because it contains injected text
		return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
	}

	const isKeepAll = (wordBreak === 'keepAll');
	const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, fontSegments, defaultFontInfo, tabSize, firstLineBreakColumn, wrappingIndent);
	const wrappedLineBreakWidth = (firstLineBreakColumn - wrappedTextIndentLength) * defaultFontInfo.typicalFullwidthCharacterWidth;

	const breakingOffsets: number[] = [];
	const breakingOffsetsVisibleColumn: number[] = [];
	let breakingOffsetsCount: number = 0;
	let breakOffset = 0;
	let breakOffsetVisibleWidth = 0;

	let breakingWidth = firstLineBreakColumn * defaultFontInfo.typicalHalfwidthCharacterWidth;
	let prevCharCode = lineText.charCodeAt(0);
	let prevCharCodeClass = classifier.get(prevCharCode);
	const typicalFullwidthCharacterWidth = computeCharWidth(prevCharCode, fontSegments, defaultFontInfo);
	let widthSoFar = typicalFullwidthCharacterWidth;

	let startOffset = 1;
	if (strings.isHighSurrogate(prevCharCode)) {
		// A surrogate pair must always be considered as a single unit, so it is never to be broken
		widthSoFar += typicalFullwidthCharacterWidth;
		prevCharCode = lineText.charCodeAt(1);
		prevCharCodeClass = classifier.get(prevCharCode);
		startOffset++;
	}

	for (let i = startOffset; i < len; i++) {
		const charStartOffset = i;
		const charCode = lineText.charCodeAt(i);
		let charCodeClass: CharacterClass;
		let charWidth: number;
		const typicalFullwidthCharacterWidth = computeCharWidth(i, fontSegments, defaultFontInfo);

		if (strings.isHighSurrogate(charCode)) {
			// A surrogate pair must always be considered as a single unit, so it is never to be broken
			i++;
			charCodeClass = CharacterClass.NONE;
			charWidth = 2 * typicalFullwidthCharacterWidth;
		} else {
			charCodeClass = classifier.get(charCode);
			charWidth = typicalFullwidthCharacterWidth;
		}

		if (canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
			breakOffset = charStartOffset;
			breakOffsetVisibleWidth = widthSoFar;
		}

		widthSoFar += charWidth;

		// check if adding character at `i` will go over the breaking column
		if (widthSoFar > breakingWidth) {
			// We need to break at least before character at `i`:

			if (breakOffset === 0 || widthSoFar - breakOffsetVisibleWidth > wrappedLineBreakWidth) {
				// Cannot break at `breakOffset`, must break at `i`
				breakOffset = charStartOffset;
				breakOffsetVisibleWidth = widthSoFar - charWidth;
			}

			breakingOffsets[breakingOffsetsCount] = breakOffset;
			breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleWidth;
			breakingOffsetsCount++;
			breakingWidth = (breakOffsetVisibleWidth + wrappedLineBreakWidth) * defaultFontInfo.typicalFullwidthCharacterWidth;
			breakOffset = 0;
		}

		prevCharCode = charCode;
		prevCharCodeClass = charCodeClass;
	}

	if (breakingOffsetsCount === 0 && (!injectedTexts || injectedTexts.length === 0)) {
		return null;
	}

	// Add last segment
	breakingOffsets[breakingOffsetsCount] = len;
	breakingOffsetsVisibleColumn[breakingOffsetsCount] = visibleColumn;

	return new ModelLineProjectionData(injectionOffsets, injectionOptions, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
}

function computeCharWidth(characterIndex: number, lineText: string, fontSegments: LineFontSegment[], defaultFontInfo: FontInfo, visibleColumn: number, tabSize: number): number {
	const charCode = lineText.charCodeAt(0);
	const fontInfo = findFontAtCharacterIndex(characterIndex, fontSegments, defaultFontInfo);
	let columnWidth: number = 1;
	if (charCode === CharCode.Tab) {
		columnWidth = (tabSize - (visibleColumn % tabSize));
	}
	const columnsForFullWidthChar = fontInfo.typicalFullwidthCharacterWidth / fontInfo.typicalHalfwidthCharacterWidth;
	if (strings.isFullWidthCharacter(charCode)) {
		columnWidth = columnsForFullWidthChar;
	}
	if (charCode < 32) {
		// when using `editor.renderControlCharacters`, the substitutions are often wide
		columnWidth = columnsForFullWidthChar;
	}
	const typicalFullwidthCharacterWidth = fontInfo.typicalFullwidthCharacterWidth;
	return { columnWidth, characterWidth };
}

function tabCharacterWidth(visibleColumn: number, tabSize: number): number {
	return (tabSize - (visibleColumn % tabSize));
}

/**
 * Kinsoku Shori : Don't break after a leading character, like an open bracket
 * Kinsoku Shori : Don't break before a trailing character, like a period
 */
function canBreak(prevCharCode: number, prevCharCodeClass: CharacterClass, charCode: number, charCodeClass: CharacterClass, isKeepAll: boolean): boolean {
	return (
		charCode !== CharCode.Space
		&& (
			(prevCharCodeClass === CharacterClass.BREAK_AFTER && charCodeClass !== CharacterClass.BREAK_AFTER) // break at the end of multiple BREAK_AFTER
			|| (prevCharCodeClass !== CharacterClass.BREAK_BEFORE && charCodeClass === CharacterClass.BREAK_BEFORE) // break at the start of multiple BREAK_BEFORE
			|| (!isKeepAll && prevCharCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && charCodeClass !== CharacterClass.BREAK_AFTER)
			|| (!isKeepAll && charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && prevCharCodeClass !== CharacterClass.BREAK_BEFORE)
		)
	);
}

function computeWrappedTextIndentLength(lineText: string, fontSegments: LineFontSegment[], defaultFontInfo: FontInfo, tabSize: number, firstLineBreakColumn: number, wrappingIndent: WrappingIndent): number {
	let wrappedTextIndentLength = 0;
	if (wrappingIndent !== WrappingIndent.None) {
		const firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineText);
		if (firstNonWhitespaceIndex !== -1) {
			// Track existing indent

			for (let i = 0; i < firstNonWhitespaceIndex; i++) {
				const fontInfo = findFontAtCharacterIndex(i, fontSegments, defaultFontInfo);
				const charColumn = (lineText.charCodeAt(i) === CharCode.Tab ? tabCharacterWidth(wrappedTextIndentLength, tabSize) : 1);
				const charWidth = charColumn * fontInfo.typicalFullwidthCharacterWidth;
				wrappedTextIndentLength += charWidth;
			}

			// Increase indent of continuation lines, if desired
			const numberOfAdditionalTabs = (wrappingIndent === WrappingIndent.DeepIndent ? 2 : wrappingIndent === WrappingIndent.Indent ? 1 : 0);
			const fontInfo = findFontAtCharacterIndex(0, fontSegments, defaultFontInfo);
			for (let i = 0; i < numberOfAdditionalTabs; i++) {
				const charColumn = tabCharacterWidth(wrappedTextIndentLength, tabSize);
				const charWidth = charColumn * fontInfo.typicalFullwidthCharacterWidth;
				wrappedTextIndentLength += charWidth;
			}

			// Force sticking to beginning of line if no character would fit except for the indentation
			if (wrappedTextIndentLength + fontInfo.typicalFullwidthCharacterWidth > firstLineBreakColumn * defaultFontInfo.typicalFullwidthCharacterWidth) {
				wrappedTextIndentLength = 0;
			}
		}
	}
	return wrappedTextIndentLength;
}

function findFontAtCharacterIndex(characterIndex: number, fontSegments: LineFontSegment[], defaultFontInfo: FontInfo): FontInfo {
	const index = binarySearch2(fontSegments.length, (index) => fontSegments[index].startColumn - characterIndex);
	const modifiedIndex = index < 0 ? -(index + 1) : index;
	let fontInfo: FontInfo = defaultFontInfo;
	if (modifiedIndex >= 0 && modifiedIndex < fontSegments.length && fontSegments[modifiedIndex] && fontSegments[modifiedIndex].startColumn >= characterIndex && fontSegments[modifiedIndex].endColumn >= characterIndex) {
		fontInfo = fontSegments[modifiedIndex].fontInfo;
	}
	return fontInfo;
}
