/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		return new DiffAlgorithmResult([new SequenceDiff(new OffsetRange(0, seq1.length), new OffsetRange(0, seq2.length))], false);
	}

	static trivialTimedOut(seq1: ISequence, seq2: ISequence): DiffAlgorithmResult {
		return new DiffAlgorithmResult([new SequenceDiff(new OffsetRange(0, seq1.length), new OffsetRange(0, seq2.length))], true);
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
	constructor(
		public readonly seq1Range: OffsetRange,
		public readonly seq2Range: OffsetRange,
	) { }

	public reverse(): SequenceDiff {
		return new SequenceDiff(this.seq2Range, this.seq1Range);
	}

	public toString(): string {
		return `${this.seq1Range} <-> ${this.seq2Range}`;
	}

	public join(other: SequenceDiff): SequenceDiff {
		return new SequenceDiff(this.seq1Range.join(other.seq1Range), this.seq2Range.join(other.seq2Range));
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

	constructor(private readonly timeout: number) {
		// Recommendation: Set a log-point `{this.debuggerDisable()}` here
		if (timeout <= 0) {
			throw new BugIndicatingError('timeout must be positive');
		}
	}

	public isValid(): boolean {
		const now = Date.now();
		// eslint-disable-next-line no-debugger
		// debugger; // WARNING, call `this.debuggerDisable()` to not get different results when debugging
		return now - this.startTime < this.timeout;
	}

	public debuggerDisable() {
		this.isValid = () => true;
	}
}
