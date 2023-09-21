/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findLastIdxMonotonous, findLastMonotonous, findFirstMonotonous } from 'vs/base/common/arraysFind';
import { CharCode } from 'vs/base/common/charCode';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ISequence } from 'vs/editor/common/diff/defaultLinesDiffComputer/algorithms/diffAlgorithm';
import { isSpace } from 'vs/editor/common/diff/defaultLinesDiffComputer/utils';

export class LinesSliceCharSequence implements ISequence {
	private readonly elements: number[] = [];
	private readonly firstCharOffsetByLine: number[] = [];
	public readonly lineRange: OffsetRange;
	// To account for trimming
	private readonly additionalOffsetByLine: number[] = [];

	constructor(public readonly lines: string[], lineRange: OffsetRange, public readonly considerWhitespaceChanges: boolean) {
		// This slice has to have lineRange.length many \n! (otherwise diffing against an empty slice will be problematic)
		// (Unless it covers the entire document, in that case the other slice also has to cover the entire document ands it's okay)

		// If the slice covers the end, but does not start at the beginning, we include just the \n of the previous line.
		let trimFirstLineFully = false;
		if (lineRange.start > 0 && lineRange.endExclusive >= lines.length) {
			lineRange = new OffsetRange(lineRange.start - 1, lineRange.endExclusive);
			trimFirstLineFully = true;
		}

		this.lineRange = lineRange;

		this.firstCharOffsetByLine[0] = 0;
		for (let i = this.lineRange.start; i < this.lineRange.endExclusive; i++) {
			let line = lines[i];
			let offset = 0;
			if (trimFirstLineFully) {
				offset = line.length;
				line = '';
				trimFirstLineFully = false;
			} else if (!considerWhitespaceChanges) {
				const trimmedStartLine = line.trimStart();
				offset = line.length - trimmedStartLine.length;
				line = trimmedStartLine.trimEnd();
			}

			this.additionalOffsetByLine.push(offset);

			for (let i = 0; i < line.length; i++) {
				this.elements.push(line.charCodeAt(i));
			}

			// Don't add an \n that does not exist in the document.
			if (i < lines.length - 1) {
				this.elements.push('\n'.charCodeAt(0));
				this.firstCharOffsetByLine[i - this.lineRange.start + 1] = this.elements.length;
			}
		}
		// To account for the last line
		this.additionalOffsetByLine.push(0);
	}

	toString() {
		return `Slice: "${this.text}"`;
	}

	get text(): string {
		return this.getText(new OffsetRange(0, this.length));
	}

	getText(range: OffsetRange): string {
		return this.elements.slice(range.start, range.endExclusive).map(e => String.fromCharCode(e)).join('');
	}

	getElement(offset: number): number {
		return this.elements[offset];
	}

	get length(): number {
		return this.elements.length;
	}

	public getBoundaryScore(length: number): number {
		//   a   b   c   ,           d   e   f
		// 11  0   0   12  15  6   13  0   0   11

		const prevCategory = getCategory(length > 0 ? this.elements[length - 1] : -1);
		const nextCategory = getCategory(length < this.elements.length ? this.elements[length] : -1);

		if (prevCategory === CharBoundaryCategory.LineBreakCR && nextCategory === CharBoundaryCategory.LineBreakLF) {
			// don't break between \r and \n
			return 0;
		}

		let score = 0;
		if (prevCategory !== nextCategory) {
			score += 10;
			if (prevCategory === CharBoundaryCategory.WordLower && nextCategory === CharBoundaryCategory.WordUpper) {
				score += 1;
			}
		}

		score += getCategoryBoundaryScore(prevCategory);
		score += getCategoryBoundaryScore(nextCategory);

		return score;
	}

	public translateOffset(offset: number): Position {
		// find smallest i, so that lineBreakOffsets[i] <= offset using binary search
		if (this.lineRange.isEmpty) {
			return new Position(this.lineRange.start + 1, 1);
		}

		const i = findLastIdxMonotonous(this.firstCharOffsetByLine, (value) => value <= offset);
		return new Position(this.lineRange.start + i + 1, offset - this.firstCharOffsetByLine[i] + this.additionalOffsetByLine[i] + 1);
	}

	public translateRange(range: OffsetRange): Range {
		return Range.fromPositions(this.translateOffset(range.start), this.translateOffset(range.endExclusive));
	}

	/**
	 * Finds the word that contains the character at the given offset
	 */
	public findWordContaining(offset: number): OffsetRange | undefined {
		if (offset < 0 || offset >= this.elements.length) {
			return undefined;
		}

		if (!isWordChar(this.elements[offset])) {
			return undefined;
		}

		// find start
		let start = offset;
		while (start > 0 && isWordChar(this.elements[start - 1])) {
			start--;
		}

		// find end
		let end = offset;
		while (end < this.elements.length && isWordChar(this.elements[end])) {
			end++;
		}

		return new OffsetRange(start, end);
	}

	public countLinesIn(range: OffsetRange): number {
		return this.translateOffset(range.endExclusive).lineNumber - this.translateOffset(range.start).lineNumber;
	}

	public isStronglyEqual(offset1: number, offset2: number): boolean {
		return this.elements[offset1] === this.elements[offset2];
	}

	public extendToFullLines(range: OffsetRange): OffsetRange {
		const start = findLastMonotonous(this.firstCharOffsetByLine, x => x <= range.start) ?? 0;
		const end = findFirstMonotonous(this.firstCharOffsetByLine, x => range.endExclusive <= x) ?? this.elements.length;
		return new OffsetRange(start, end);
	}
}

function isWordChar(charCode: number): boolean {
	return charCode >= CharCode.a && charCode <= CharCode.z
		|| charCode >= CharCode.A && charCode <= CharCode.Z
		|| charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9;
}

const enum CharBoundaryCategory {
	WordLower,
	WordUpper,
	WordNumber,
	End,
	Other,
	Space,
	LineBreakCR,
	LineBreakLF,
}

const score: Record<CharBoundaryCategory, number> = {
	[CharBoundaryCategory.WordLower]: 0,
	[CharBoundaryCategory.WordUpper]: 0,
	[CharBoundaryCategory.WordNumber]: 0,
	[CharBoundaryCategory.End]: 10,
	[CharBoundaryCategory.Other]: 2,
	[CharBoundaryCategory.Space]: 3,
	[CharBoundaryCategory.LineBreakCR]: 10,
	[CharBoundaryCategory.LineBreakLF]: 10,
};

function getCategoryBoundaryScore(category: CharBoundaryCategory): number {
	return score[category];
}

function getCategory(charCode: number): CharBoundaryCategory {
	if (charCode === CharCode.LineFeed) {
		return CharBoundaryCategory.LineBreakLF;
	} else if (charCode === CharCode.CarriageReturn) {
		return CharBoundaryCategory.LineBreakCR;
	} else if (isSpace(charCode)) {
		return CharBoundaryCategory.Space;
	} else if (charCode >= CharCode.a && charCode <= CharCode.z) {
		return CharBoundaryCategory.WordLower;
	} else if (charCode >= CharCode.A && charCode <= CharCode.Z) {
		return CharBoundaryCategory.WordUpper;
	} else if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9) {
		return CharBoundaryCategory.WordNumber;
	} else if (charCode === -1) {
		return CharBoundaryCategory.End;
	} else {
		return CharBoundaryCategory.Other;
	}
}

