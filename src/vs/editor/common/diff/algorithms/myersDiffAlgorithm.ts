/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffAlgorithm, ISequence, SequenceDiff, OffsetRange } from 'vs/editor/common/diff/algorithms/diffAlgorithm';

/**
 * An O(ND) diff algorithm that has a quadratic space worst-case complexity.
*/
export class MyersDiffAlgorithm implements IDiffAlgorithm {
	compute(seq1: ISequence, seq2: ISequence): SequenceDiff[] {
		// These are common special cases.
		// The early return improves performance dramatically.
		if (seq1.length === 0) {
			return [new SequenceDiff(new OffsetRange(0, 0), new OffsetRange(0, seq2.length))];
		} else if (seq2.length === 0) {
			return [new SequenceDiff(new OffsetRange(0, seq1.length), new OffsetRange(0, 0))];
		}

		function getXAfterSnake(x: number, y: number): number {
			while (x < seq1.length && y < seq2.length && seq1.getElement(x) === seq2.getElement(y)) {
				x++;
				y++;
			}
			return x;
		}

		let d = 0;
		// V[k]: X value of longest d-line that ends in diagonal k.
		// d-line: path from (0,0) to (x,y) that uses exactly d non-diagonals.
		// diagonal k: Set of points (x,y) with x-y = k.
		const V = new FastInt32Array();
		V.set(0, getXAfterSnake(0, 0));

		const paths = new FastArrayNegativeIndices<SnakePath | null>();
		paths.set(0, V.get(0) === 0 ? null : new SnakePath(null, 0, 0, V.get(0)));

		let k = 0;

		loop: while (true) {
			d++;
			for (k = -d; k <= d; k += 2) {
				const maxXofDLineTop = k === d ? -1 : V.get(k + 1); // We take a vertical non-diagonal
				const maxXofDLineLeft = k === -d ? -1 : V.get(k - 1) + 1; // We take a horizontal non-diagonal (+1 x)
				const x = Math.min(Math.max(maxXofDLineTop, maxXofDLineLeft), seq1.length);
				const y = x - k;
				const newMaxX = getXAfterSnake(x, y);
				V.set(k, newMaxX);
				const lastPath = x === maxXofDLineTop ? paths.get(k + 1) : paths.get(k - 1);
				paths.set(k, newMaxX !== x ? new SnakePath(lastPath, x, y, newMaxX - x) : lastPath);

				if (V.get(k) === seq1.length && V.get(k) - k === seq2.length) {
					break loop;
				}
			}
		}

		let path = paths.get(k);
		const result: SequenceDiff[] = [];
		let lastAligningPosS1: number = seq1.length;
		let lastAligningPosS2: number = seq2.length;

		while (true) {
			const endX = path ? path.x + path.length : 0;
			const endY = path ? path.y + path.length : 0;

			if (endX !== lastAligningPosS1 || endY !== lastAligningPosS2) {
				result.push(new SequenceDiff(
					new OffsetRange(endX, lastAligningPosS1),
					new OffsetRange(endY, lastAligningPosS2),
				));
			}
			if (!path) {
				break;
			}
			lastAligningPosS1 = path.x;
			lastAligningPosS2 = path.y;

			path = path.prev;
		}

		result.reverse();
		return result;
	}
}

class SnakePath {
	constructor(
		public readonly prev: SnakePath | null,
		public readonly x: number,
		public readonly y: number,
		public readonly length: number
	) {
	}
}

/**
 * An array that supports fast negative indices.
*/
class FastInt32Array {
	private positiveArr: Int32Array = new Int32Array(10);
	private negativeArr: Int32Array = new Int32Array(10);

	get(idx: number): number {
		if (idx < 0) {
			idx = -idx - 1;
			return this.negativeArr[idx];
		} else {
			return this.positiveArr[idx];
		}
	}

	set(idx: number, value: number): void {
		if (idx < 0) {
			idx = -idx - 1;
			if (idx >= this.negativeArr.length) {
				const arr = this.negativeArr;
				this.negativeArr = new Int32Array(arr.length * 2);
				this.negativeArr.set(arr);
			}
			this.negativeArr[idx] = value;
		} else {
			if (idx >= this.positiveArr.length) {
				const arr = this.positiveArr;
				this.positiveArr = new Int32Array(arr.length * 2);
				this.positiveArr.set(arr);
			}
			this.positiveArr[idx] = value;
		}
	}
}

/**
 * An array that supports fast negative indices.
*/
class FastArrayNegativeIndices<T> {
	private readonly positiveArr: T[] = [];
	private readonly negativeArr: T[] = [];

	get(idx: number): T {
		if (idx < 0) {
			idx = -idx - 1;
			return this.negativeArr[idx];
		} else {
			return this.positiveArr[idx];
		}
	}

	set(idx: number, value: T): void {
		if (idx < 0) {
			idx = -idx - 1;
			this.negativeArr[idx] = value;
		} else {
			this.positiveArr[idx] = value;
		}
	}
}
