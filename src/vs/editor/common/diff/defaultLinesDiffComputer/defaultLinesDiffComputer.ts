/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { assertFn } from '../../../../base/common/assert.js';
import { LineRange } from '../../core/lineRange.js';
import { OffsetRange } from '../../core/offsetRange.js';
import { Position } from '../../core/position.js';
import { Range } from '../../core/range.js';
import { ArrayText } from '../../core/textEdit.js';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LinesDiff, MovedText } from '../linesDiffComputer.js';
import { DetailedLineRangeMapping, LineRangeMapping, lineRangeMappingFromRangeMappings, RangeMapping } from '../rangeMapping.js';
import { DateTimeout, InfiniteTimeout, ITimeout, SequenceDiff } from './algorithms/diffAlgorithm.js';
import { DynamicProgrammingDiffing } from './algorithms/dynamicProgrammingDiffing.js';
import { MyersDiffAlgorithm } from './algorithms/myersDiffAlgorithm.js';
import { computeMovedLines } from './computeMovedLines.js';
import { extendDiffsToEntireWordIfAppropriate, optimizeSequenceDiffs, removeShortMatches, removeVeryShortMatchingLinesBetweenDiffs, removeVeryShortMatchingTextBetweenLongDiffs } from './heuristicSequenceOptimizations.js';
import { LineSequence } from './lineSequence.js';
import { LinesSliceCharSequence } from './linesSliceCharSequence.js';

export class DefaultLinesDiffComputer implements ILinesDiffComputer {
	private readonly dynamicProgrammingDiffing = new DynamicProgrammingDiffing();
	private readonly myersDiffingAlgorithm = new MyersDiffAlgorithm();

	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff {
		if (originalLines.length <= 1 && equals(originalLines, modifiedLines, (a, b) => a === b)) {
			return new LinesDiff([], [], false);
		}

		if (originalLines.length === 1 && originalLines[0].length === 0 || modifiedLines.length === 1 && modifiedLines[0].length === 0) {
			return new LinesDiff([
				new DetailedLineRangeMapping(
					new LineRange(1, originalLines.length + 1),
					new LineRange(1, modifiedLines.length + 1),
					[
						new RangeMapping(
							new Range(1, 1, originalLines.length, originalLines[originalLines.length - 1].length + 1),
							new Range(1, 1, modifiedLines.length, modifiedLines[modifiedLines.length - 1].length + 1),
						)
					]
				)
			], [], false);
		}

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

		const originalLinesHashes = originalLines.map((l) => getOrCreateHash(l.trim()));
		const modifiedLinesHashes = modifiedLines.map((l) => getOrCreateHash(l.trim()));

		const sequence1 = new LineSequence(originalLinesHashes, originalLines);
		const sequence2 = new LineSequence(modifiedLinesHashes, modifiedLines);

		const lineAlignmentResult = (() => {
			if (sequence1.length + sequence2.length < 1700) {
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
				sequence2,
				timeout
			);
		})();

		let lineAlignments = lineAlignmentResult.diffs;
		let hitTimeout = lineAlignmentResult.hitTimeout;
		lineAlignments = optimizeSequenceDiffs(sequence1, sequence2, lineAlignments);
		lineAlignments = removeVeryShortMatchingLinesBetweenDiffs(sequence1, sequence2, lineAlignments);

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
			if (characterDiffs.hitTimeout) {
				hitTimeout = true;
			}
			for (const a of characterDiffs.mappings) {
				alignments.push(a);
			}
		}

		scanForWhitespaceChanges(originalLines.length - seq1LastStart);

		const changes = lineRangeMappingFromRangeMappings(alignments, new ArrayText(originalLines), new ArrayText(modifiedLines));

		let moves: MovedText[] = [];
		if (options.computeMoves) {
			moves = this.computeMoves(changes, originalLines, modifiedLines, originalLinesHashes, modifiedLinesHashes, timeout, considerWhitespaceChanges);
		}

		// Make sure all ranges are valid
		assertFn(() => {
			function validatePosition(pos: Position, lines: string[]): boolean {
				if (pos.lineNumber < 1 || pos.lineNumber > lines.length) { return false; }
				const line = lines[pos.lineNumber - 1];
				if (pos.column < 1 || pos.column > line.length + 1) { return false; }
				return true;
			}

			function validateRange(range: LineRange, lines: string[]): boolean {
				if (range.startLineNumber < 1 || range.startLineNumber > lines.length + 1) { return false; }
				if (range.endLineNumberExclusive < 1 || range.endLineNumberExclusive > lines.length + 1) { return false; }
				return true;
			}

			for (const c of changes) {
				if (!c.innerChanges) { return false; }
				for (const ic of c.innerChanges) {
					const valid = validatePosition(ic.modifiedRange.getStartPosition(), modifiedLines) && validatePosition(ic.modifiedRange.getEndPosition(), modifiedLines) &&
						validatePosition(ic.originalRange.getStartPosition(), originalLines) && validatePosition(ic.originalRange.getEndPosition(), originalLines);
					if (!valid) {
						return false;
					}
				}
				if (!validateRange(c.modified, modifiedLines) || !validateRange(c.original, originalLines)) {
					return false;
				}
			}
			return true;
		});

		return new LinesDiff(changes, moves, hitTimeout);
	}

	private computeMoves(
		changes: DetailedLineRangeMapping[],
		originalLines: string[],
		modifiedLines: string[],
		hashedOriginalLines: number[],
		hashedModifiedLines: number[],
		timeout: ITimeout,
		considerWhitespaceChanges: boolean,
	): MovedText[] {
		const moves = computeMovedLines(
			changes,
			originalLines,
			modifiedLines,
			hashedOriginalLines,
			hashedModifiedLines,
			timeout,
		);
		const movesWithDiffs = moves.map(m => {
			const moveChanges = this.refineDiff(originalLines, modifiedLines, new SequenceDiff(
				m.original.toOffsetRange(),
				m.modified.toOffsetRange(),
			), timeout, considerWhitespaceChanges);
			const mappings = lineRangeMappingFromRangeMappings(moveChanges.mappings, new ArrayText(originalLines), new ArrayText(modifiedLines), true);
			return new MovedText(m, mappings);
		});
		return movesWithDiffs;
	}

	private refineDiff(originalLines: string[], modifiedLines: string[], diff: SequenceDiff, timeout: ITimeout, considerWhitespaceChanges: boolean): { mappings: RangeMapping[]; hitTimeout: boolean } {
		const lineRangeMapping = toLineRangeMapping(diff);
		const rangeMapping = lineRangeMapping.toRangeMapping2(originalLines, modifiedLines);

		const slice1 = new LinesSliceCharSequence(originalLines, rangeMapping.originalRange, considerWhitespaceChanges);
		const slice2 = new LinesSliceCharSequence(modifiedLines, rangeMapping.modifiedRange, considerWhitespaceChanges);

		const diffResult = slice1.length + slice2.length < 500
			? this.dynamicProgrammingDiffing.compute(slice1, slice2, timeout)
			: this.myersDiffingAlgorithm.compute(slice1, slice2, timeout);

		const check = false;

		let diffs = diffResult.diffs;
		if (check) { SequenceDiff.assertSorted(diffs); }
		diffs = optimizeSequenceDiffs(slice1, slice2, diffs);
		if (check) { SequenceDiff.assertSorted(diffs); }
		diffs = extendDiffsToEntireWordIfAppropriate(slice1, slice2, diffs);
		if (check) { SequenceDiff.assertSorted(diffs); }
		diffs = removeShortMatches(slice1, slice2, diffs);
		if (check) { SequenceDiff.assertSorted(diffs); }
		diffs = removeVeryShortMatchingTextBetweenLongDiffs(slice1, slice2, diffs);
		if (check) { SequenceDiff.assertSorted(diffs); }

		const result = diffs.map(
			(d) =>
				new RangeMapping(
					slice1.translateRange(d.seq1Range),
					slice2.translateRange(d.seq2Range)
				)
		);

		if (check) { RangeMapping.assertSorted(result); }

		// Assert: result applied on original should be the same as diff applied to original

		return {
			mappings: result,
			hitTimeout: diffResult.hitTimeout,
		};
	}
}

function toLineRangeMapping(sequenceDiff: SequenceDiff) {
	return new LineRangeMapping(
		new LineRange(sequenceDiff.seq1Range.start + 1, sequenceDiff.seq1Range.endExclusive + 1),
		new LineRange(sequenceDiff.seq2Range.start + 1, sequenceDiff.seq2Range.endExclusive + 1),
	);
}
