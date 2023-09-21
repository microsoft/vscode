/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { forEachAdjacent } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';

/**
 * Represents a synchronous diff algorithm. Should be executed in a worker.
*/
export interface IDiffAlgorithm {
	compute(sequence1: ISequence, sequence2: ISequence, timeout?: ITimeout): DiffAlgorithmResult;
}

export class DiffAlgorithmResult {
	static trivial(seq1: ISequence, seq2: ISequence): DiffAlgorithmResult {
		return new DiffAlgorithmResult([new SequenceDiff(OffsetRange.ofLength(seq1.length), OffsetRange.ofLength(seq2.length))], false);
	}

	static trivialTimedOut(seq1: ISequence, seq2: ISequence): DiffAlgorithmResult {
		return new DiffAlgorithmResult([new SequenceDiff(OffsetRange.ofLength(seq1.length), OffsetRange.ofLength(seq2.length))], true);
	}

	constructor(
		public readonly diffs: SequenceDiff[],
		/**
		 * Indicates if the time out was reached.
		 * In that case, the diffs might be an approximation and the user should be asked to rerun the diff with more time.
		 */
		public readonly hitTimeout: boolean,
	) { }
}

export class SequenceDiff {
	public static invert(sequenceDiffs: SequenceDiff[], doc1Length: number): SequenceDiff[] {
		const result: SequenceDiff[] = [];
		forEachAdjacent(sequenceDiffs, (a, b) => {
			result.push(SequenceDiff.fromOffsetPairs(
				a ? a.getEndExclusives() : OffsetPair.zero,
				b ? b.getStarts() : new OffsetPair(doc1Length, (a ? a.seq2Range.endExclusive - a.seq1Range.endExclusive : 0) + doc1Length)
			));
		});
		return result;
	}

	public static fromOffsetPairs(start: OffsetPair, endExclusive: OffsetPair): SequenceDiff {
		return new SequenceDiff(
			new OffsetRange(start.offset1, endExclusive.offset1),
			new OffsetRange(start.offset2, endExclusive.offset2),
		);
	}

	constructor(
		public readonly seq1Range: OffsetRange,
		public readonly seq2Range: OffsetRange,
	) { }

	public swap(): SequenceDiff {
		return new SequenceDiff(this.seq2Range, this.seq1Range);
	}

	public toString(): string {
		return `${this.seq1Range} <-> ${this.seq2Range}`;
	}

	public join(other: SequenceDiff): SequenceDiff {
		return new SequenceDiff(this.seq1Range.join(other.seq1Range), this.seq2Range.join(other.seq2Range));
	}

	public delta(offset: number): SequenceDiff {
		if (offset === 0) {
			return this;
		}
		return new SequenceDiff(this.seq1Range.delta(offset), this.seq2Range.delta(offset));
	}

	public deltaStart(offset: number): SequenceDiff {
		if (offset === 0) {
			return this;
		}
		return new SequenceDiff(this.seq1Range.deltaStart(offset), this.seq2Range.deltaStart(offset));
	}

	public deltaEnd(offset: number): SequenceDiff {
		if (offset === 0) {
			return this;
		}
		return new SequenceDiff(this.seq1Range.deltaEnd(offset), this.seq2Range.deltaEnd(offset));
	}

	public intersectsOrTouches(other: SequenceDiff): boolean {
		return this.seq1Range.intersectsOrTouches(other.seq1Range) || this.seq2Range.intersectsOrTouches(other.seq2Range);
	}

	public intersect(other: SequenceDiff): SequenceDiff | undefined {
		const i1 = this.seq1Range.intersect(other.seq1Range);
		const i2 = this.seq2Range.intersect(other.seq2Range);
		if (!i1 || !i2) {
			return undefined;
		}
		return new SequenceDiff(i1, i2);
	}

	public getStarts(): OffsetPair {
		return new OffsetPair(this.seq1Range.start, this.seq2Range.start);
	}

	public getEndExclusives(): OffsetPair {
		return new OffsetPair(this.seq1Range.endExclusive, this.seq2Range.endExclusive);
	}
}

export class OffsetPair {
	public static readonly zero = new OffsetPair(0, 0);
	public static readonly max = new OffsetPair(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

	constructor(
		public readonly offset1: number,
		public readonly offset2: number,
	) {
	}

	public toString(): string {
		return `${this.offset1} <-> ${this.offset2}`;
	}
}

export interface ISequence {
	getElement(offset: number): number;
	get length(): number;

	/**
	 * The higher the score, the better that offset can be used to split the sequence.
	 * Is used to optimize insertions.
	 * Must not be negative.
	*/
	getBoundaryScore?(length: number): number;

	/**
	 * For line sequences, getElement returns a number representing trimmed lines.
	 * This however checks equality for the original lines.
	 * It prevents shifting to less matching lines.
	 */
	isStronglyEqual(offset1: number, offset2: number): boolean;
}

export interface ITimeout {
	isValid(): boolean;
}

export class InfiniteTimeout implements ITimeout {
	public static instance = new InfiniteTimeout();

	isValid(): boolean {
		return true;
	}
}

export class DateTimeout implements ITimeout {
	private readonly startTime = Date.now();
	private valid = true;

	constructor(private timeout: number) {
		if (timeout <= 0) {
			throw new BugIndicatingError('timeout must be positive');
		}
	}

	// Recommendation: Set a log-point `{this.disable()}` in the body
	public isValid(): boolean {
		const valid = Date.now() - this.startTime < this.timeout;
		if (!valid && this.valid) {
			this.valid = false; // timeout reached
			// eslint-disable-next-line no-debugger
			debugger; // WARNING: Most likely debugging caused the timeout. Call `this.disable()` to continue without timing out.
		}
		return this.valid;
	}

	public disable() {
		this.timeout = Number.MAX_SAFE_INTEGER;
		this.isValid = () => true;
		this.valid = true;
	}
}
