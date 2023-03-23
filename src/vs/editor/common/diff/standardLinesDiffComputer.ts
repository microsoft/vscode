/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn, checkAdjacentItems } from 'vs/base/common/assert';
import { CharCode } from 'vs/base/common/charCode';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { DateTimeout, ISequence, ITimeout, InfiniteTimeout, SequenceDiff } from 'vs/editor/common/diff/algorithms/diffAlgorithm';
import { DynamicProgrammingDiffing } from 'vs/editor/common/diff/algorithms/dynamicProgrammingDiffing';
import { optimizeSequenceDiffs, smoothenSequenceDiffs } from 'vs/editor/common/diff/algorithms/joinSequenceDiffs';
import { MyersDiffAlgorithm } from 'vs/editor/common/diff/algorithms/myersDiffAlgorithm';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LineRangeMapping, LinesDiff, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';

export class StandardLinesDiffComputer implements ILinesDiffComputer {
	private readonly dynamicProgrammingDiffing = new DynamicProgrammingDiffing();
	private readonly myersDiffingAlgorithm = new MyersDiffAlgorithm();

	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff {
		const timeout = options.maxComputationTimeMs === 0 ? InfiniteTimeout.instance : new DateTimeout(options.maxComputationTimeMs);
		const considerWhitespaceChanges = !options.ignoreTrimWhitespace;

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

		const sequence1 = new LineSequence(srcDocLines, originalLines);
		const sequence2 = new LineSequence(tgtDocLines, modifiedLines);

		const lineAlignmentResult = (() => {
			if (sequence1.length + sequence2.length < 1500) {
				// Use the improved algorithm for small files
				return this.dynamicProgrammingDiffing.compute(
					sequence1,
					sequence2,
					timeout,
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

		let lineAlignments = lineAlignmentResult.diffs;
		let hitTimeout = lineAlignmentResult.hitTimeout;
		lineAlignments = optimizeSequenceDiffs(sequence1, sequence2, lineAlignments);

		const alignments: RangeMapping[] = [];

		const scanForWhitespaceChanges = (equalLinesCount: number) => {
			if (!considerWhitespaceChanges) {
				return;
			}

			for (let i = 0; i < equalLinesCount; i++) {
				const seq1Offset = seq1LastStart + i;
				const seq2Offset = seq2LastStart + i;
				if (originalLines[seq1Offset] !== modifiedLines[seq2Offset]) {
					// This is because of whitespace changes, diff these lines
					const characterDiffs = this.refineDiff(originalLines, modifiedLines, new SequenceDiff(
						new OffsetRange(seq1Offset, seq1Offset + 1),
						new OffsetRange(seq2Offset, seq2Offset + 1),
					), timeout, considerWhitespaceChanges);
					for (const a of characterDiffs.mappings) {
						alignments.push(a);
					}
					if (characterDiffs.hitTimeout) {
						hitTimeout = true;
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

			const characterDiffs = this.refineDiff(originalLines, modifiedLines, diff, timeout, considerWhitespaceChanges);
			for (const a of characterDiffs.mappings) {
				alignments.push(a);
			}
		}

		scanForWhitespaceChanges(originalLines.length - seq1LastStart);

		const changes: LineRangeMapping[] = lineRangeMappingFromRangeMappings(alignments);
		const fixedChanges = moveUpInvalidInnerChanges(changes, originalLines.length, modifiedLines.length);
		return new LinesDiff(fixedChanges, hitTimeout);
	}

	private refineDiff(originalLines: string[], modifiedLines: string[], diff: SequenceDiff, timeout: ITimeout, considerWhitespaceChanges: boolean): { mappings: RangeMapping[]; hitTimeout: boolean } {
		const sourceSlice = new Slice(originalLines, diff.seq1Range, considerWhitespaceChanges);
		const targetSlice = new Slice(modifiedLines, diff.seq2Range, considerWhitespaceChanges);

		const diffResult = sourceSlice.length + targetSlice.length < 500
			? this.dynamicProgrammingDiffing.compute(sourceSlice, targetSlice, timeout)
			: this.myersDiffingAlgorithm.compute(sourceSlice, targetSlice, timeout);

		let diffs = diffResult.diffs;
		diffs = coverFullWords(sourceSlice, targetSlice, diffs);
		diffs = optimizeSequenceDiffs(sourceSlice, targetSlice, diffs);
		diffs = smoothenSequenceDiffs(sourceSlice, targetSlice, diffs);

		const result = diffs.map(
			(d) =>
				new RangeMapping(
					sourceSlice.translateRange(d.seq1Range),
					targetSlice.translateRange(d.seq2Range)
				)
		);

		// Assert: result applied on original should be the same as diff applied to original

		return {
			mappings: result,
			hitTimeout: diffResult.hitTimeout,
		};
	}
}

function coverFullWords(sequence1: Slice, sequence2: Slice, sequenceDiffs: SequenceDiff[]): SequenceDiff[] {
	const additional: SequenceDiff[] = [];

	let lastModifiedWord: { added: number; deleted: number; count: number; s1Range: OffsetRange; s2Range: OffsetRange } | undefined = undefined;

	function maybePushWordToAdditional() {
		if (!lastModifiedWord) {
			return;
		}

		const originalLength1 = lastModifiedWord.s1Range.length - lastModifiedWord.deleted;
		const originalLength2 = lastModifiedWord.s2Range.length - lastModifiedWord.added;
		if (originalLength1 !== originalLength2) {
			lastModifiedWord = undefined;
			return; // TODO figure out why this happens
		}

		if (Math.max(lastModifiedWord.deleted, lastModifiedWord.added) + (lastModifiedWord.count - 1) > originalLength1) {
			additional.push(new SequenceDiff(lastModifiedWord.s1Range, lastModifiedWord.s2Range));
		}

		lastModifiedWord = undefined;
	}

	for (const s of sequenceDiffs) {
		function processWord(s1Range: OffsetRange, s2Range: OffsetRange) {
			if (!lastModifiedWord || !lastModifiedWord.s1Range.equals(s1Range) || !lastModifiedWord.s2Range.equals(s2Range)) {
				if (lastModifiedWord && lastModifiedWord.s1Range.endExclusive < s1Range.start && lastModifiedWord.s2Range.endExclusive < s2Range.start) {
					maybePushWordToAdditional();
				}
				lastModifiedWord = { added: 0, deleted: 0, count: 0, s1Range: s1Range, s2Range: s2Range };
			}

			const changedS1 = s1Range.intersect(s.seq1Range);
			const changedS2 = s2Range.intersect(s.seq2Range);
			lastModifiedWord.count++;
			lastModifiedWord.added += changedS2?.length ?? 0;
			lastModifiedWord.deleted += changedS1?.length ?? 0;
		}

		const w1Before = sequence1.findWordContaining(s.seq1Range.start - 1);
		const w2Before = sequence2.findWordContaining(s.seq2Range.start - 1);

		const w1After = sequence1.findWordContaining(s.seq1Range.endExclusive);
		const w2After = sequence2.findWordContaining(s.seq2Range.endExclusive);

		if (w1Before && w1After && w2Before && w2After && w1Before.equals(w1After) && w2Before.equals(w2After)) {
			processWord(w1Before, w2Before);
		} else {
			if (w1Before && w2Before) {
				processWord(w1Before, w2Before);
			}
			if (w1After && w2After) {
				processWord(w1After, w2After);
			}
		}
	}

	maybePushWordToAdditional();

	const merged = mergeSequenceDiffs(sequenceDiffs, additional);
	return merged;
}

function mergeSequenceDiffs(sequenceDiffs1: SequenceDiff[], sequenceDiffs2: SequenceDiff[]): SequenceDiff[] {
	const result: SequenceDiff[] = [];

	while (sequenceDiffs1.length > 0 || sequenceDiffs2.length > 0) {
		const sd1 = sequenceDiffs1[0];
		const sd2 = sequenceDiffs2[0];

		let next: SequenceDiff;
		if (sd1 && (!sd2 || sd1.seq1Range.start < sd2.seq1Range.start)) {
			next = sequenceDiffs1.shift()!;
		} else {
			next = sequenceDiffs2.shift()!;
		}

		if (result.length > 0 && result[result.length - 1].seq1Range.endExclusive >= next.seq1Range.start) {
			result[result.length - 1] = result[result.length - 1].join(next);
		} else {
			result.push(next);
		}
	}

	return result;
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

		const originalLineRange = new LineRange(
			first.originalRange.startLineNumber,
			last.originalRange.endLineNumber + (last.originalRange.endColumn > 1 || last.modifiedRange.endColumn > 1 ? 1 : 0)
		);
		const modifiedLineRange = new LineRange(
			first.modifiedRange.startLineNumber,
			last.modifiedRange.endLineNumber + (last.originalRange.endColumn > 1 || last.modifiedRange.endColumn > 1 ? 1 : 0)
		);

		changes.push(new LineRangeMapping(
			originalLineRange,
			modifiedLineRange,
			g,
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

// We can get rid of this function by making sure `refineDiff` doesn't assume (H).
// However, this makes {@see lineRangeMappingFromRangeMappings} much more complicated.
function moveUpInvalidInnerChanges(alignments: LineRangeMapping[], originalLineCount: number, modifiedLineCount: number): LineRangeMapping[] {
	return alignments.map(a => {
		if (!a.innerChanges) {
			return a;
		}

		return new LineRangeMapping(a.originalRange, a.modifiedRange, a.innerChanges.map(c => {
			if (c.originalRange.endColumn === 1 && c.originalRange.endLineNumber > originalLineCount) {
				assertFn(() => c.modifiedRange.endColumn === 1 && c.modifiedRange.endLineNumber > modifiedLineCount);

				if (c.originalRange.isEmpty() || c.modifiedRange.isEmpty()) {
					assertFn(() => c.originalRange.startColumn === 1 && c.modifiedRange.startColumn === 1);
					assertFn(() =>
						/* Both ranges go to the end, if both start from the beginning, both would be empty */
						c.originalRange.startLineNumber > 1 && c.modifiedRange.startLineNumber > 1
					);

					return new RangeMapping(
						new Range(c.originalRange.startLineNumber - 1, Number.MAX_SAFE_INTEGER, c.originalRange.endLineNumber - 1, Number.MAX_SAFE_INTEGER),
						new Range(c.modifiedRange.startLineNumber - 1, Number.MAX_SAFE_INTEGER, c.modifiedRange.endLineNumber - 1, Number.MAX_SAFE_INTEGER),
					);
				} else {
					return new RangeMapping(
						new Range(c.originalRange.startLineNumber, c.originalRange.startColumn, c.originalRange.endLineNumber - 1, Number.MAX_SAFE_INTEGER),
						new Range(c.modifiedRange.startLineNumber, c.modifiedRange.startColumn, c.modifiedRange.endLineNumber - 1, Number.MAX_SAFE_INTEGER),
					);
				}
			}
			assertFn(() => !(c.modifiedRange.endColumn === 1 && c.modifiedRange.endLineNumber > modifiedLineCount));

			return c;
		}));
	});
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

export class LineSequence implements ISequence {
	constructor(
		private readonly trimmedHash: number[],
		private readonly lines: string[]
	) { }

	getElement(offset: number): number {
		return this.trimmedHash[offset];
	}

	get length(): number {
		return this.trimmedHash.length;
	}

	getBoundaryScore(length: number): number {
		const indentationBefore = length === 0 ? 0 : getIndentation(this.lines[length - 1]);
		const indentationAfter = length === this.lines.length ? 0 : getIndentation(this.lines[length]);
		return 1000 - (indentationBefore + indentationAfter);
	}
}

function getIndentation(str: string): number {
	let i = 0;
	while (i < str.length && (str.charCodeAt(i) === CharCode.Space || str.charCodeAt(i) === CharCode.Tab)) {
		i++;
	}
	return i;
}

class Slice implements ISequence {
	private readonly elements: number[] = [];
	private readonly firstCharOffsetByLineMinusOne: number[] = [];
	public readonly lineRange: OffsetRange;
	// To account for trimming
	private readonly offsetByLine: number[] = [];

	constructor(public readonly lines: string[], lineRange: OffsetRange, public readonly considerWhitespaceChanges: boolean) {
		this.lineRange = lineRange;

		for (let i = this.lineRange.start; i < this.lineRange.endExclusive; i++) {
			const l = lines[i];
			const l1 = considerWhitespaceChanges ? l : l.trimStart();
			const line = considerWhitespaceChanges ? l1 : l1.trimEnd();

			this.offsetByLine.push(l.length - l1.length);

			for (let i = 0; i < line.length; i++) {
				this.elements.push(line.charCodeAt(i));
			}
			// We assume that every line ends with a newline so that we can diff a full line against an empty range (H).
			// However, this can lead to positions that are outside of the document.
			// This is fixed later.
			this.elements.push('\n'.charCodeAt(0));
			this.firstCharOffsetByLineMinusOne[i - this.lineRange.start] = this.elements.length;
		}
		// To account for the last line
		this.offsetByLine.push(0);
	}

	toString() {
		return `Slice: "${this.text}"`;
	}

	get text(): string {
		return [...this.elements].map(e => String.fromCharCode(e)).join('');
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
			if (nextCategory === CharBoundaryCategory.WordUpper) {
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

		let i = 0;
		let j = this.firstCharOffsetByLineMinusOne.length;
		while (i < j) {
			const k = Math.floor((i + j) / 2);
			if (this.firstCharOffsetByLineMinusOne[k] > offset) {
				j = k;
			} else {
				i = k + 1;
			}
		}

		const offsetOfPrevLineBreak = i === 0 ? 0 : this.firstCharOffsetByLineMinusOne[i - 1];
		return new Position(this.lineRange.start + i + 1, offset - offsetOfPrevLineBreak + 1 + this.offsetByLine[i]);
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

function isSpace(charCode: number): boolean {
	return charCode === CharCode.Space || charCode === CharCode.Tab;
}
