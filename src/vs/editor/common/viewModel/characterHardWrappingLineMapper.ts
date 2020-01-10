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

let arrPool1: number[] = [];
let arrPool2: number[] = [];
function createLineMappingFromPreviousLineMapping(classifier: WrappingCharacterClassifier, previousBreakingData: LineBreakingData, lineText: string, tabSize: number, firstLineBreakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): LineBreakingData | null {
	if (firstLineBreakingColumn === -1) {
		return null;
	}

	const len = lineText.length;
	if (len <= 1) {
		return null;
	}

	const prevBreakingOffsets = previousBreakingData.breakOffsets;
	const prevBreakingOffsetsVisibleColumn = previousBreakingData.breakingOffsetsVisibleColumn;

	const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakingColumn, columnsForFullWidthChar, hardWrappingIndent);
	const wrappedLineBreakingColumn = firstLineBreakingColumn - wrappedTextIndentLength;

	let breakingOffsets: number[] = arrPool1;
	let breakingOffsetsVisibleColumn: number[] = arrPool2;
	let breakingOffsetsCount: number = 0;

	let breakingColumn = firstLineBreakingColumn;
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
		const prevBreakOffset = prevIndex < 0 ? 0 : prevBreakingOffsets[prevIndex];
		const prevBreakoffsetVisibleColumn = prevIndex < 0 ? 0 : prevBreakingOffsetsVisibleColumn[prevIndex];

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
				const charStartOffset = i;
				const charCode = lineText.charCodeAt(i);
				let charCodeClass: number;
				let charWidth: number;

				if (strings.isHighSurrogate(charCode)) {
					// A surrogate pair must always be considered as a single unit, so it is never to be broken
					i++;
					charCodeClass = CharacterClass.NONE;
					charWidth = 2;
				} else {
					charCodeClass = classifier.get(charCode);
					charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
				}

				if (canBreak(prevCharCodeClass, charCodeClass)) {
					breakOffset = charStartOffset;
					breakOffsetVisibleColumn = visibleColumn;
				}

				visibleColumn += charWidth;

				// check if adding character at `i` will go over the breaking column
				if (visibleColumn > breakingColumn) {
					// We need to break at least before character at `i`:
					forcedBreakOffset = charStartOffset;
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
				if (breakingOffsetsCount > 0) {
					// Add last segment
					breakingOffsets[breakingOffsetsCount] = prevBreakingOffsets[prevBreakingOffsets.length - 1];
					breakingOffsetsVisibleColumn[breakingOffsetsCount] = prevBreakingOffsetsVisibleColumn[prevBreakingOffsets.length - 1];
				}
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
				const charStartOffset = i + 1;
				const prevCharCode = lineText.charCodeAt(i);

				if (prevCharCode === CharCode.Tab) {
					// cannot determine the width of a tab when going backwards, so we must go forwards
					hitATabCharacter = true;
					break;
				}

				let prevCharCodeClass: number;
				let prevCharWidth: number;

				if (strings.isLowSurrogate(prevCharCode)) {
					// A surrogate pair must always be considered as a single unit, so it is never to be broken
					i--;
					prevCharCodeClass = CharacterClass.NONE;
					prevCharWidth = 2;
				} else {
					prevCharCodeClass = classifier.get(prevCharCode);
					prevCharWidth = (strings.isFullWidthCharacter(prevCharCode) ? columnsForFullWidthChar : 1);
				}

				if (visibleColumn <= breakingColumn) {
					if (forcedBreakOffset === 0) {
						forcedBreakOffset = charStartOffset;
						forcedBreakOffsetVisibleColumn = visibleColumn;
					}

					if (visibleColumn <= breakingColumn - wrappedLineBreakingColumn) {
						// went too far!
						break;
					}

					if (canBreak(prevCharCodeClass, charCodeClass)) {
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
				const remainingWidthOfNextLine = wrappedLineBreakingColumn - (forcedBreakOffsetVisibleColumn - breakOffsetVisibleColumn);
				if (remainingWidthOfNextLine <= tabSize) {
					const charCodeAtForcedBreakOffset = lineText.charCodeAt(forcedBreakOffset);
					let charWidth: number;
					if (strings.isHighSurrogate(charCodeAtForcedBreakOffset)) {
						// A surrogate pair must always be considered as a single unit, so it is never to be broken
						charWidth = 2;
					} else {
						charWidth = computeCharWidth(charCodeAtForcedBreakOffset, forcedBreakOffsetVisibleColumn, tabSize, columnsForFullWidthChar);
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

		breakingOffsets[breakingOffsetsCount] = breakOffset;
		breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
		breakingOffsetsCount++;
		breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakingColumn;

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
	arrPool2 = previousBreakingData.breakingOffsetsVisibleColumn;
	previousBreakingData.breakingColumn = firstLineBreakingColumn;
	previousBreakingData.breakOffsets = breakingOffsets;
	previousBreakingData.breakingOffsetsVisibleColumn = breakingOffsetsVisibleColumn;
	previousBreakingData.wrappedTextIndentLength = wrappedTextIndentLength;
	return previousBreakingData;

	// return new LineBreakingData(firstLineBreakingColumn, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);

	// const expected = createLineMapping(classifier, lineText, tabSize, firstLineBreakingColumn, columnsForFullWidthChar, hardWrappingIndent);
	// const actual = new LineBreakingData(firstLineBreakingColumn, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
	// try {
	// 	actual.assertEqual(expected);
	// } catch (err) {
	// 	console.log(`BREAKING!!`);
	// 	console.log(err);
	// 	console.log(`
	// firstLineBreakingColumn: ${firstLineBreakingColumn}

	// previous breaks: ${JSON.stringify(prevBreakingOffsets)}, breakingOffsetsVisibleColumn: ${JSON.stringify(prevBreakingOffsetsVisibleColumn)}
	// expected breaks: ${JSON.stringify(expected?.breakOffsets)}, breakingOffsetsVisibleColumn: ${JSON.stringify(expected?.breakingOffsetsVisibleColumn)}
	//   actual breaks: ${JSON.stringify(actual?.breakOffsets)}, breakingOffsetsVisibleColumn: ${JSON.stringify(actual?.breakingOffsetsVisibleColumn)}

	// previous str:  ${toAnnotatedText(lineText, previousBreakingData)}
	// expected str:  ${toAnnotatedText(lineText, expected)}
	//    actual str: ${toAnnotatedText(lineText, actual)}

	// 	assertIncrementalLineMapping(
	// 		factory, ${str(lineText)}, 4,
	// 		${previousBreakingData.breakingColumn}, ${str(toAnnotatedText(lineText, previousBreakingData))},
	// 		${expected!.breakingColumn}, ${str(toAnnotatedText(lineText, expected))},
	// 		WrappingIndent.${hardWrappingIndent === WrappingIndent.None ? 'None' : hardWrappingIndent === WrappingIndent.Same ? 'Same' : hardWrappingIndent === WrappingIndent.Indent ? 'Indent' : 'DeepIndent'}
	// 	);
	// `);
	// 	function str(strr: string) {
	// 		return `'${strr.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
	// 	}
	// 	function toAnnotatedText(text: string, lineBreakingData: LineBreakingData | null): string {
	// 		// Insert line break markers again, according to algorithm
	// 		let actualAnnotatedText = '';
	// 		if (lineBreakingData) {
	// 			let previousLineIndex = 0;
	// 			for (let i = 0, len = text.length; i < len; i++) {
	// 				let r = LineBreakingData.getOutputPositionOfInputOffset(lineBreakingData.breakOffsets, i);
	// 				if (previousLineIndex !== r.outputLineIndex) {
	// 					previousLineIndex = r.outputLineIndex;
	// 					actualAnnotatedText += '|';
	// 				}
	// 				actualAnnotatedText += text.charAt(i);
	// 			}
	// 		} else {
	// 			// No wrapping
	// 			actualAnnotatedText = text;
	// 		}
	// 		return actualAnnotatedText;
	// 	}
	// }
	// return actual;
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

	let startOffset = 1;
	if (strings.isHighSurrogate(prevCharCode)) {
		// A surrogate pair must always be considered as a single unit, so it is never to be broken
		visibleColumn += 1;
		prevCharCode = lineText.charCodeAt(1);
		prevCharCodeClass = classifier.get(prevCharCode);
		startOffset++;
	}

	for (let i = startOffset; i < len; i++) {
		const charStartOffset = i;
		const charCode = lineText.charCodeAt(i);
		let charCodeClass: number;
		let charWidth: number;

		if (strings.isHighSurrogate(charCode)) {
			// A surrogate pair must always be considered as a single unit, so it is never to be broken
			i++;
			charCodeClass = CharacterClass.NONE;
			charWidth = 2;
		} else {
			charCodeClass = classifier.get(charCode);
			charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
		}

		if (canBreak(prevCharCodeClass, charCodeClass)) {
			breakOffset = charStartOffset;
			breakOffsetVisibleColumn = visibleColumn;
		}

		visibleColumn += charWidth;

		// check if adding character at `i` will go over the breaking column
		if (visibleColumn > breakingColumn) {
			// We need to break at least before character at `i`:

			if (breakOffset === 0 || visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakingColumn) {
				// Cannot break at `breakOffset`, must break at `i`
				breakOffset = charStartOffset;
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
