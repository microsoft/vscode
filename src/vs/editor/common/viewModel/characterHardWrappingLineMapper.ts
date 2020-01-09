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
					const previousLineBreakingData = previousBreakingData[i];
					if (previousLineBreakingData) {
						result[i] = createLineMappingFromPreviousLineMapping(this.classifier, previousLineBreakingData, requests[i], tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
					} else {
						result[i] = createLineMapping(this.classifier, requests[i], tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
					}
				}
				return result;
			}
		};
	}
}

function createLineMappingFromPreviousLineMapping(classifier: WrappingCharacterClassifier, previousBreakingData: LineBreakingData, lineText: string, tabSize: number, firstLineBreakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): LineBreakingData | null {
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

	const prevBreakingOffsets = previousBreakingData.breakOffsets;
	const prevBreakingOffsetsVisibleColumn = previousBreakingData.breakingOffsetsVisibleColumn;

	let breakingColumn = firstLineBreakingColumn;
	const prevLen = prevBreakingOffsets.length;
	let prevIndex = 0;

	if (prevIndex >= 0) {
		let currentDiff = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
		while (prevIndex + 1 < prevLen) {
			const potentialDiff = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
			if (potentialDiff >= currentDiff) {
				break;
			}
			currentDiff = potentialDiff;
			prevIndex++;
		}
	}

	while (prevIndex < prevLen) {
		// Allow for prevIndex to be -1 (for the case where we hit a tab when walking backwards from the first break)
		const prevBreakOffset = prevIndex < 0 ? 0 : prevBreakingOffsets[prevIndex];
		const prevBreakoffsetVisibleColumn = prevIndex < 0 ? 0 : prevBreakingOffsetsVisibleColumn[prevIndex];;

		let breakOffset = 0;
		let breakOffsetVisibleColumn = 0;

		let forcedBreakOffset = 0;
		let forcedBreakOffsetVisibleColumn = 0;

		// initially, we search as much as possible to the right (if it fits)
		if (prevBreakoffsetVisibleColumn <= breakingColumn) {
			let visibleColumn = prevBreakoffsetVisibleColumn;
			let prevCharCode = lineText.charCodeAt(prevBreakOffset - 1);
			let prevCharCodeClass = classifier.get(prevCharCode);
			let entireLineFits = true;
			for (let i = prevBreakOffset; i < len; i++) {
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

				if (visibleColumn > breakingColumn) {
					// We need to break at least before character at `i`:
					forcedBreakOffset = i;
					forcedBreakOffsetVisibleColumn = visibleColumn - charWidth;

					if (visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakingColumn) {
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
				// Add last segment
				breakingOffsets[breakingOffsetsCount] = prevBreakingOffsets[prevBreakingOffsets.length - 1];
				breakingOffsetsVisibleColumn[breakingOffsetsCount] = prevBreakingOffsetsVisibleColumn[prevBreakingOffsets.length - 1];
				break;
			}
		}

		if (breakOffset === 0) {
			// must search left
			let visibleColumn = prevBreakoffsetVisibleColumn;
			let charCode = lineText.charCodeAt(prevBreakOffset);
			let charCodeClass = classifier.get(charCode);
			let hitATabCharacter = false;
			for (let i = prevBreakOffset - 1; i >= 0; i--) {
				const prevCharCode = lineText.charCodeAt(i);
				const prevCharCodeClass = classifier.get(prevCharCode);

				if (strings.isHighSurrogate(prevCharCode)) {
					// A surrogate pair must always be considered as a single unit, so it is never to be broken
					visibleColumn -= 1;
					charCode = prevCharCode;
					charCodeClass = prevCharCodeClass;
					continue;
				}

				if (prevCharCode === CharCode.Tab) {
					// cannot determine the width of a tab when going backwards, so we must go forwards
					hitATabCharacter = true;
					break;
				}

				const charWidth = (strings.isFullWidthCharacter(prevCharCode) ? columnsForFullWidthChar : 1);

				if (visibleColumn <= breakingColumn) {
					if (forcedBreakOffset === 0) {
						forcedBreakOffset = i + 1;
						forcedBreakOffsetVisibleColumn = visibleColumn;
					}

					if (visibleColumn <= breakingColumn - wrappedLineBreakingColumn) {
						// went too far!
						break;
					}

					if (canBreak(prevCharCodeClass, charCodeClass)) {
						breakOffset = i + 1;
						breakOffsetVisibleColumn = visibleColumn;
						break;
					}
				}

				visibleColumn -= charWidth;
				charCode = prevCharCode;
				charCodeClass = prevCharCodeClass;
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

		breakingOffsets[breakingOffsetsCount] = breakOffset;
		breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
		breakingOffsetsCount++;
		breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakingColumn;

		while (prevIndex < 0 || (prevIndex < prevLen && prevBreakingOffsetsVisibleColumn[prevIndex] < breakOffsetVisibleColumn)) {
			prevIndex++;
		}

		let currentDiff = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
		// let lastBreakingColumn
		while (prevIndex + 1 < prevLen) {
			const potentialDiff = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
			if (potentialDiff >= currentDiff) {
				break;
			}
			currentDiff = potentialDiff;
			prevIndex++;
		}
	}

	if (breakingOffsetsCount === 0) {
		return null;
	}

	// return new LineBreakingData(firstLineBreakingColumn, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
	const expected = createLineMapping(classifier, lineText, tabSize, firstLineBreakingColumn, columnsForFullWidthChar, hardWrappingIndent);
	const actual = new LineBreakingData(firstLineBreakingColumn, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
	try {
		actual.assertEqual(expected);
	} catch (err) {
		console.log(`BREAKING!!`);
		console.log(err);
		console.log(`previous breaks: ${JSON.stringify(prevBreakingOffsets)}, breakingOffsetsVisibleColumn: ${JSON.stringify(prevBreakingOffsetsVisibleColumn)}`);
		console.log(`expected breakOffsets: ${JSON.stringify(expected?.breakOffsets)}, breakingOffsetsVisibleColumn: ${JSON.stringify(expected?.breakingOffsetsVisibleColumn)}`);
		console.log(`actual breakOffsets: ${JSON.stringify(actual?.breakOffsets)}, breakingOffsetsVisibleColumn: ${JSON.stringify(actual?.breakingOffsetsVisibleColumn)}`);

		console.log(`actual str: ${toAnnotatedText(lineText, actual)}`);


		console.log(`
	assertIncrementalLineMapping(
		factory, ${str(lineText)}, 4,
		${previousBreakingData.breakingColumn}, ${str(toAnnotatedText(lineText, previousBreakingData))},
		${expected!.breakingColumn}, ${str(toAnnotatedText(lineText, expected))},
		WrappingIndent.${hardWrappingIndent === WrappingIndent.None ? 'None' : hardWrappingIndent === WrappingIndent.Same ? 'Same' : hardWrappingIndent === WrappingIndent.Indent ? 'Indent' : 'DeepIndent'}
	);
`);
		function str(strr: string) {
			return `'${strr.replace(/'/g, '\\\'')}'`;
		}
		function toAnnotatedText(text: string, lineBreakingData: LineBreakingData | null): string {
			// Insert line break markers again, according to algorithm
			let actualAnnotatedText = '';
			if (lineBreakingData) {
				let previousLineIndex = 0;
				for (let i = 0, len = text.length; i < len; i++) {
					let r = LineBreakingData.getOutputPositionOfInputOffset(lineBreakingData.breakOffsets, i);
					if (previousLineIndex !== r.outputLineIndex) {
						previousLineIndex = r.outputLineIndex;
						actualAnnotatedText += '|';
					}
					actualAnnotatedText += text.charAt(i);
				}
			} else {
				// No wrapping
				actualAnnotatedText = text;
			}
			return actualAnnotatedText;
		}
	}
	return actual;

}

function createLineMapping(classifier: WrappingCharacterClassifier, lineText: string, tabSize: number, firstLineBreakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): LineBreakingData | null {
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
