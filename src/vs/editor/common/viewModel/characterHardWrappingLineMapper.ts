/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { WrappingIndent, IComputedEditorOptions, EditorOption } from 'vs/editor/common/config/editorOptions';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';
import { ILineMapperFactory, ILineMapping, OutputPosition, ILineMappingComputer } from 'vs/editor/common/viewModel/splitLinesCollection';

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

	public createLineMappingComputer(tabSize: number, wrappingColumn: number, columnsForFullWidthChar: number, wrappingIndent: WrappingIndent): ILineMappingComputer {
		let requests: string[] = [];
		return {
			addRequest: (lineText: string) => {
				requests.push(lineText);
			},
			finalize: () => {
				let result: (ILineMapping | null)[] = [];
				for (let i = 0, len = requests.length; i < len; i++) {
					result[i] = this._createLineMapping(requests[i], tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent);
				}
				return result;
			}
		};
	}

	private _createLineMapping(lineText: string, tabSize: number, breakingColumn: number, columnsForFullWidthChar: number, hardWrappingIndent: WrappingIndent): ILineMapping | null {
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

		const classifier = this.classifier;
		let breakingOffsets: number[] = []; // The offset where a break occurs
		let breakingOffsetsIndex: number = 0; // The count of breaks already done
		let visibleColumn = 0; // Visible column since the beginning of the current line
		let niceBreakOffset = 0; // Last index of a character that indicates a break should happen before it (more desirable)
		let niceBreakVisibleColumn = 0; // visible column if a break were to be later introduced before `niceBreakOffset`
		const len = lineText.length;

		for (let i = 0; i < len; i++) {
			// At this point, there is a certainty that the character before `i` fits on the current line,
			// but the character at `i` might not fit

			const charCode = lineText.charCodeAt(i);
			if (strings.isLowSurrogate(charCode)) {
				// A surrogate pair must always be considered as a single unit, so it is never to be broken

				// Advance visibleColumn & niceBreakVisibleColumn
				visibleColumn = visibleColumn + 1;
				if (niceBreakOffset !== 0) {
					niceBreakVisibleColumn = niceBreakVisibleColumn + 1;
				}
				continue;
			}

			const charCodeClass = classifier.get(charCode);

			if (
				(charCodeClass === CharacterClass.BREAK_BEFORE)
				|| (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && i > 0 && classifier.get(lineText.charCodeAt(i - 1)) !== CharacterClass.BREAK_BEFORE)
			) {
				// This is a character that indicates that a break should happen before it
				// (or) CJK breaking : before break : Kinsoku Shori : Don't break after a leading character, like an open bracket
				// Since we are certain the character before `i` fits, there's no extra checking needed,
				// just mark it as a nice breaking opportunity
				niceBreakOffset = i;
				niceBreakVisibleColumn = wrappedTextIndentVisibleColumn;
			}

			const charCodeIsTab = (charCode === CharCode.Tab);
			const charColumnSize = strings.isFullWidthCharacter(charCode) ? columnsForFullWidthChar : 1;

			// Advance visibleColumn with character at `i`
			visibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(visibleColumn, tabSize, charCodeIsTab, charColumnSize);

			if (visibleColumn > breakingColumn && i !== 0) {
				// We need to break at least before character at `i`:
				//  - break before niceBreakLastOffset if it exists (and re-establish a correct visibleColumn by using niceBreakVisibleColumn + charAt(i))
				//  - otherwise, break before obtrusiveBreakLastOffset if it exists (and re-establish a correct visibleColumn by using obtrusiveBreakVisibleColumn + charAt(i))
				//  - otherwise, break before i (and re-establish a correct visibleColumn by charAt(i))

				if (niceBreakOffset !== 0 && niceBreakVisibleColumn <= breakingColumn) {

					// We will break before `niceBreakLastOffset`
					breakingOffsets[breakingOffsetsIndex++] = niceBreakOffset;
					visibleColumn = niceBreakVisibleColumn;

				} else {

					// We will break before `i`
					breakingOffsets[breakingOffsetsIndex++] = i;
					visibleColumn = wrappedTextIndentVisibleColumn;

				}

				// Re-establish visibleColumn by taking character at `i` into account
				visibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(visibleColumn, tabSize, charCodeIsTab, charColumnSize);

				// Reset markers
				niceBreakOffset = 0;
			}

			// At this point, there is a certainty that the character at `i` fits on the current line

			if (niceBreakOffset !== 0) {
				// Advance niceBreakVisibleColumn
				niceBreakVisibleColumn = CharacterHardWrappingLineMapperFactory.nextVisibleColumn(niceBreakVisibleColumn, tabSize, charCodeIsTab, charColumnSize);
			}

			if (
				(charCodeClass === CharacterClass.BREAK_AFTER && (hardWrappingIndent === WrappingIndent.None || i >= firstNonWhitespaceIndex))
				|| (charCodeClass === CharacterClass.BREAK_IDEOGRAPHIC && i + 1 < len && classifier.get(lineText.charCodeAt(i + 1)) !== CharacterClass.BREAK_AFTER)
			) {
				// This is a character that indicates that a break should happen after it
				// (or) CJK breaking : after break : Kinsoku Shori : Don't break before a trailing character, like a period
				niceBreakOffset = i + 1;
				niceBreakVisibleColumn = wrappedTextIndentVisibleColumn;
			}
		}

		if (breakingOffsetsIndex === 0) {
			return null;
		}

		// Add last segment
		breakingOffsets[breakingOffsetsIndex++] = len;

		return new CharacterHardWrappingLineMapping(breakingOffsets, wrappedTextIndent);
	}
}

export class CharacterHardWrappingLineMapping implements ILineMapping {

	private readonly _breakingOffsets: number[];
	private readonly _wrappedLinesIndent: string;

	constructor(breakingOffsets: number[], wrappedLinesIndent: string) {
		this._breakingOffsets = breakingOffsets;
		this._wrappedLinesIndent = wrappedLinesIndent;
	}

	public getOutputLineCount(): number {
		return this._breakingOffsets.length;
	}

	public getWrappedLinesIndent(): string {
		return this._wrappedLinesIndent;
	}

	public getInputOffsetOfOutputPosition(outputLineIndex: number, outputOffset: number): number {
		if (outputLineIndex === 0) {
			return outputOffset;
		} else {
			return this._breakingOffsets[outputLineIndex - 1] + outputOffset;
		}
	}

	public getOutputPositionOfInputOffset(inputOffset: number): OutputPosition {
		inputOffset = inputOffset | 0; //@perf
		const breakingOffsets = this._breakingOffsets;

		let low = 0;
		let high = breakingOffsets.length - 1;
		let mid = 0;
		let midStop = 0;
		let midStart = 0;

		while (low <= high) {
			mid = low + ((high - low) / 2) | 0;

			midStop = breakingOffsets[mid];
			midStart = mid > 0 ? breakingOffsets[mid - 1] : 0;

			if (inputOffset < midStart) {
				high = mid - 1;
			} else if (inputOffset >= midStop) {
				low = mid + 1;
			} else {
				break;
			}
		}

		return new OutputPosition(mid, inputOffset - midStart);
	}
}
