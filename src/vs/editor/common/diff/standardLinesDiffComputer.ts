/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn, checkAdjacentItems } from 'vs/base/common/assert';
import { CharCode } from 'vs/base/common/charCode';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { SequenceFromIntArray, OffsetRange, SequenceDiff, ISequence } from 'vs/editor/common/diff/algorithms/diffAlgorithm';
import { DynamicProgrammingDiffing } from 'vs/editor/common/diff/algorithms/dynamicProgrammingDiffing';
import { optimizeSequenceDiffs } from 'vs/editor/common/diff/algorithms/joinSequenceDiffs';
import { MyersDiffAlgorithm } from 'vs/editor/common/diff/algorithms/myersDiffAlgorithm';
import { ILinesDiff, ILinesDiffComputer, ILinesDiffComputerOptions, LineRange, LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';

export class StandardLinesDiffComputer implements ILinesDiffComputer {
	private readonly dynamicProgrammingDiffing = new DynamicProgrammingDiffing();
	private readonly myersDiffingAlgorithm = new MyersDiffAlgorithm();

	constructor(
	) { }

	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): ILinesDiff {
		const perfectHashes = new Map<string, number>();
		function getOrCreateHash(text: string): number {
			let hash = perfectHashes.get(text);
			if (hash === undefined) {
				hash = perfectHashes.size;
				perfectHashes.set(text, hash);
			}
			return hash;
		}

		const srcDocLines = originalLines.map((l) => getOrCreateHash(l.trim()));
		const tgtDocLines = modifiedLines.map((l) => getOrCreateHash(l.trim()));

		const sequence1 = new SequenceFromIntArray(srcDocLines);
		const sequence2 = new SequenceFromIntArray(tgtDocLines);

		const lineAlignments = (() => {
			if (sequence1.length + sequence2.length < 1500) {
				// Use the improved algorithm for small files
				return this.dynamicProgrammingDiffing.compute(
					sequence1,
					sequence2,
					(offset1, offset2) =>
						originalLines[offset1] === modifiedLines[offset2]
							? modifiedLines[offset2].length === 0
								? 0.1
								: 1 + Math.log(1 + modifiedLines[offset2].length)
							: 0.99
				);
			}

			return this.myersDiffingAlgorithm.compute(
				sequence1,
				sequence2
			);
		})();

		const alignments: RangeMapping[] = [];

		const scanForWhitespaceChanges = (equalLinesCount: number) => {
			for (let i = 0; i < equalLinesCount; i++) {
				const seq1Offset = seq1LastStart + i;
				const seq2Offset = seq2LastStart + i;
				if (originalLines[seq1Offset] !== modifiedLines[seq2Offset]) {
					// This is because of whitespace changes, diff these lines
					const characterDiffs = this.refineDiff(originalLines, modifiedLines, new SequenceDiff(
						new OffsetRange(seq1Offset, seq1Offset + 1),
						new OffsetRange(seq2Offset, seq2Offset + 1)
					));
					for (const a of characterDiffs) {
						alignments.push(a);
					}
				}
			}
		};

		let seq1LastStart = 0;
		let seq2LastStart = 0;

		for (const diff of lineAlignments) {
			assertFn(() => diff.seq1Range.start - seq1LastStart === diff.seq2Range.start - seq2LastStart);

			const equalLinesCount = diff.seq1Range.start - seq1LastStart;

			scanForWhitespaceChanges(equalLinesCount);

			seq1LastStart = diff.seq1Range.endExclusive;
			seq2LastStart = diff.seq2Range.endExclusive;

			const characterDiffs = this.refineDiff(originalLines, modifiedLines, diff);
			for (const a of characterDiffs) {
				alignments.push(a);
			}
		}

		scanForWhitespaceChanges(originalLines.length - seq1LastStart);

		const changes: LineRangeMapping[] = lineRangeMappingFromRangeMappings(alignments);

		return {
			quitEarly: false,
			changes: changes,
		};
	}

	private refineDiff(originalLines: string[], modifiedLines: string[], diff: SequenceDiff): RangeMapping[] {
		const sourceSlice = new Slice(originalLines, diff.seq1Range);
		const targetSlice = new Slice(modifiedLines, diff.seq2Range);

		const originalDiffs = sourceSlice.length + targetSlice.length < 500
			? this.dynamicProgrammingDiffing.compute(sourceSlice, targetSlice)
			: this.myersDiffingAlgorithm.compute(sourceSlice, targetSlice);

		const diffs = optimizeSequenceDiffs(sourceSlice, targetSlice, originalDiffs);
		const result = diffs.map(
			(d) =>
				new RangeMapping(
					sourceSlice.translateRange(d.seq1Range).delta(diff.seq1Range.start),
					targetSlice.translateRange(d.seq2Range).delta(diff.seq2Range.start)
				)
		);
		return result;
	}
}

export function lineRangeMappingFromRangeMappings(alignments: RangeMapping[]): LineRangeMapping[] {
	const changes: LineRangeMapping[] = [];
	for (const g of group(
		alignments,
		(a1, a2) =>
			(a2.originalRange.startLineNumber - (a1.originalRange.endLineNumber - (a1.originalRange.endColumn > 1 ? 0 : 1)) <= 1)
			|| (a2.modifiedRange.startLineNumber - (a1.modifiedRange.endLineNumber - (a1.modifiedRange.endColumn > 1 ? 0 : 1)) <= 1)
	)) {
		const first = g[0];
		const last = g[g.length - 1];

		changes.push(new LineRangeMapping(
			new LineRange(
				first.originalRange.startLineNumber,
				last.originalRange.endLineNumber + (last.originalRange.endColumn > 1 || last.modifiedRange.endColumn > 1 ? 1 : 0)
			),
			new LineRange(
				first.modifiedRange.startLineNumber,
				last.modifiedRange.endLineNumber + (last.originalRange.endColumn > 1 || last.modifiedRange.endColumn > 1 ? 1 : 0)
			),
			g
		));
	}

	assertFn(() => {
		return checkAdjacentItems(changes,
			(m1, m2) => m2.originalRange.startLineNumber - m1.originalRange.endLineNumberExclusive === m2.modifiedRange.startLineNumber - m1.modifiedRange.endLineNumberExclusive &&
				// There has to be an unchanged line in between (otherwise both diffs should have been joined)
				m1.originalRange.endLineNumberExclusive < m2.originalRange.startLineNumber &&
				m1.modifiedRange.endLineNumberExclusive < m2.modifiedRange.startLineNumber,
		);
	});


	return changes;
}

function* group<T>(items: Iterable<T>, shouldBeGrouped: (item1: T, item2: T) => boolean): Iterable<T[]> {
	let currentGroup: T[] | undefined;
	let last: T | undefined;
	for (const item of items) {
		if (last !== undefined && shouldBeGrouped(last, item)) {
			currentGroup!.push(item);
		} else {
			if (currentGroup) {
				yield currentGroup;
			}
			currentGroup = [item];
		}
		last = item;
	}
	if (currentGroup) {
		yield currentGroup;
	}
}

class Slice implements ISequence {
	private readonly elements: Int32Array;
	private readonly firstCharOnLineOffsets: Int32Array;

	constructor(public readonly lines: string[], public readonly lineRange: OffsetRange) {
		let chars = 0;
		this.firstCharOnLineOffsets = new Int32Array(lineRange.length);

		for (let i = lineRange.start; i < lineRange.endExclusive; i++) {
			const line = lines[i];
			chars += line.length;
			this.firstCharOnLineOffsets[i - lineRange.start] = chars + 1;
			chars++;
		}

		this.elements = new Int32Array(chars);
		let offset = 0;
		for (let i = lineRange.start; i < lineRange.endExclusive; i++) {
			const line = lines[i];

			for (let i = 0; i < line.length; i++) {
				this.elements[offset + i] = line.charCodeAt(i);
			}
			offset += line.length;
			if (i < lines.length - 1) {
				this.elements[offset] = '\n'.charCodeAt(0);
				offset += 1;
			}
		}
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

		let score = 0;
		if (prevCategory !== nextCategory) {
			score += 10;
		}

		score += getCategoryBoundaryScore(prevCategory);
		score += getCategoryBoundaryScore(nextCategory);

		return score;
	}

	public translateOffset(offset: number): Position {
		// find smallest i, so that lineBreakOffsets[i] > offset using binary search

		let i = 0;
		let j = this.firstCharOnLineOffsets.length;
		while (i < j) {
			const k = Math.floor((i + j) / 2);
			if (this.firstCharOnLineOffsets[k] > offset) {
				j = k;
			} else {
				i = k + 1;
			}
		}

		const offsetOfPrevLineBreak = i === 0 ? 0 : this.firstCharOnLineOffsets[i - 1];
		return new Position(i + 1, offset - offsetOfPrevLineBreak + 1);
	}

	public translateRange(range: OffsetRange): Range {
		return Range.fromPositions(this.translateOffset(range.start), this.translateOffset(range.endExclusive));
	}
}

const enum CharBoundaryCategory {
	Word = 0,
	End = 1,
	Other = 2,
	Space = 3,
}

function getCategoryBoundaryScore(category: CharBoundaryCategory): number {
	return category;
}

function getCategory(charCode: number): CharBoundaryCategory {
	if (isSpace(charCode)) {
		return CharBoundaryCategory.Space;
	} else if (isWordChar(charCode)) {
		return CharBoundaryCategory.Word;
	} else if (charCode === -1) {
		return CharBoundaryCategory.End;
	} else {
		return CharBoundaryCategory.Other;
	}
}

function isWordChar(charCode: number): boolean {
	return (
		(charCode >= CharCode.a && charCode <= CharCode.z)
		|| (charCode >= CharCode.A && charCode <= CharCode.Z)
		|| (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9)
	);
}

function isSpace(charCode: number): boolean {
	return charCode === CharCode.Space || charCode === CharCode.Tab || charCode === CharCode.LineFeed || charCode === CharCode.CarriageReturn;
}
