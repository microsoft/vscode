/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DiffChange } from 'vs/base/common/diff/diffChange';

export interface ISequence {
	getLength(): number;
	getElementHash(index: number): string;
}

export interface IDiffChange {
	/**
	 * The position of the first element in the original sequence which
	 * this change affects.
	 */
	originalStart: number;

	/**
	 * The number of elements from the original sequence which were
	 * affected.
	 */
	originalLength: number;

	/**
	 * The position of the first element in the modified sequence which
	 * this change affects.
	 */
	modifiedStart: number;

	/**
	 * The number of elements from the modified sequence which were
	 * affected (added).
	 */
	modifiedLength: number;
}

export interface IContinueProcessingPredicate {
	(furthestOriginalIndex: number, originalSequence: ISequence, matchLengthOfLongest: number): boolean;
}

export interface IHashFunction {
	(sequence: ISequence, index: number): string;
}

/**
 * An implementation of the difference algorithm described by Hirschberg
 */
export class LcsDiff2 {

	private x: ISequence;
	private y: ISequence;

	private ids_for_x: number[];
	private ids_for_y: number[];

	private hashFunc: IHashFunction;

	private resultX: boolean[];
	private resultY: boolean[];
	private forwardPrev: number[];
	private forwardCurr: number[];
	private backwardPrev: number[];
	private backwardCurr: number[];

	constructor(originalSequence: ISequence, newSequence: ISequence, continueProcessingPredicate: IContinueProcessingPredicate, hashFunc: IHashFunction) {
		this.x = originalSequence;
		this.y = newSequence;
		this.ids_for_x = [];
		this.ids_for_y = [];

		if (hashFunc) {
			this.hashFunc = hashFunc;
		} else {
			this.hashFunc = function (sequence, index) {
				return sequence[index];
			};
		}

		this.resultX = [];
		this.resultY = [];
		this.forwardPrev = [];
		this.forwardCurr = [];
		this.backwardPrev = [];
		this.backwardCurr = [];

		for (let i = 0, length = this.x.getLength(); i < length; i++) {
			this.resultX[i] = false;
		}

		for (let i = 0, length = this.y.getLength(); i <= length; i++) {
			this.resultY[i] = false;
		}

		this.ComputeUniqueIdentifiers();
	}

	private ComputeUniqueIdentifiers() {
		let xLength = this.x.getLength();
		let yLength = this.y.getLength();
		this.ids_for_x = new Array<number>(xLength);
		this.ids_for_y = new Array<number>(yLength);

		// Create a new hash table for unique elements from the original
		// sequence.
		let hashTable: { [key: string]: number; } = {};
		let currentUniqueId = 1;
		let i: number;

		// Fill up the hash table for unique elements
		for (i = 0; i < xLength; i++) {
			let xElementHash = this.x.getElementHash(i);
			if (!hashTable.hasOwnProperty(xElementHash)) {
				// No entry in the hashtable so this is a new unique element.
				// Assign the element a new unique identifier and add it to the
				// hash table
				this.ids_for_x[i] = currentUniqueId++;
				hashTable[xElementHash] = this.ids_for_x[i];
			} else {
				this.ids_for_x[i] = hashTable[xElementHash];
			}
		}

		// Now match up modified elements
		for (i = 0; i < yLength; i++) {
			let yElementHash = this.y.getElementHash(i);
			if (!hashTable.hasOwnProperty(yElementHash)) {
				this.ids_for_y[i] = currentUniqueId++;
				hashTable[yElementHash] = this.ids_for_y[i];
			} else {
				this.ids_for_y[i] = hashTable[yElementHash];
			}
		}
	}

	private ElementsAreEqual(xIndex: number, yIndex: number): boolean {
		return this.ids_for_x[xIndex] === this.ids_for_y[yIndex];
	}

	public ComputeDiff(): IDiffChange[] {
		let xLength = this.x.getLength();
		let yLength = this.y.getLength();

		this.execute(0, xLength - 1, 0, yLength - 1);

		// Construct the changes
		let i = 0;
		let j = 0;
		let xChangeStart: number, yChangeStart: number;
		let changes: DiffChange[] = [];
		while (i < xLength && j < yLength) {
			if (this.resultX[i] && this.resultY[j]) {
				// No change
				i++;
				j++;
			} else {
				xChangeStart = i;
				yChangeStart = j;
				while (i < xLength && !this.resultX[i]) {
					i++;
				}
				while (j < yLength && !this.resultY[j]) {
					j++;
				}
				changes.push(new DiffChange(xChangeStart, i - xChangeStart, yChangeStart, j - yChangeStart));
			}
		}
		if (i < xLength) {
			changes.push(new DiffChange(i, xLength - i, yLength, 0));
		}
		if (j < yLength) {
			changes.push(new DiffChange(xLength, 0, j, yLength - j));
		}
		return changes;
	}

	private forward(xStart: number, xStop: number, yStart: number, yStop: number): number[] {
		let prev = this.forwardPrev,
			curr = this.forwardCurr,
			tmp: number[],
			i: number,
			j: number;

		// First line
		prev[yStart] = this.ElementsAreEqual(xStart, yStart) ? 1 : 0;
		for (j = yStart + 1; j <= yStop; j++) {
			prev[j] = this.ElementsAreEqual(xStart, j) ? 1 : prev[j - 1];
		}

		for (i = xStart + 1; i <= xStop; i++) {
			// First column
			curr[yStart] = this.ElementsAreEqual(i, yStart) ? 1 : prev[yStart];

			for (j = yStart + 1; j <= yStop; j++) {
				if (this.ElementsAreEqual(i, j)) {
					curr[j] = prev[j - 1] + 1;
				} else {
					curr[j] = prev[j] > curr[j - 1] ? prev[j] : curr[j - 1];
				}
			}

			// Swap prev & curr
			tmp = curr;
			curr = prev;
			prev = tmp;
		}

		// Result is always in prev
		return prev;
	}

	private backward(xStart: number, xStop: number, yStart: number, yStop: number): number[] {
		let prev = this.backwardPrev,
			curr = this.backwardCurr,
			tmp: number[],
			i: number,
			j: number;

		// Last line
		prev[yStop] = this.ElementsAreEqual(xStop, yStop) ? 1 : 0;
		for (j = yStop - 1; j >= yStart; j--) {
			prev[j] = this.ElementsAreEqual(xStop, j) ? 1 : prev[j + 1];
		}

		for (i = xStop - 1; i >= xStart; i--) {
			// Last column
			curr[yStop] = this.ElementsAreEqual(i, yStop) ? 1 : prev[yStop];

			for (j = yStop - 1; j >= yStart; j--) {
				if (this.ElementsAreEqual(i, j)) {
					curr[j] = prev[j + 1] + 1;
				} else {
					curr[j] = prev[j] > curr[j + 1] ? prev[j] : curr[j + 1];
				}
			}

			// Swap prev & curr
			tmp = curr;
			curr = prev;
			prev = tmp;
		}

		// Result is always in prev
		return prev;
	}

	private findCut(xStart: number, xStop: number, yStart: number, yStop: number, middle: number): number {
		let L1 = this.forward(xStart, middle, yStart, yStop);
		let L2 = this.backward(middle + 1, xStop, yStart, yStop);

		// First cut
		let max = L2[yStart], cut = yStart - 1;

		// Middle cut
		for (let j = yStart; j < yStop; j++) {
			if (L1[j] + L2[j + 1] > max) {
				max = L1[j] + L2[j + 1];
				cut = j;
			}
		}

		// Last cut
		if (L1[yStop] > max) {
			max = L1[yStop];
			cut = yStop;
		}

		return cut;
	}

	private execute(xStart: number, xStop: number, yStart: number, yStop: number) {
		// Do some prefix trimming
		while (xStart <= xStop && yStart <= yStop && this.ElementsAreEqual(xStart, yStart)) {
			this.resultX[xStart] = true;
			xStart++;
			this.resultY[yStart] = true;
			yStart++;
		}

		// Do some suffix trimming
		while (xStart <= xStop && yStart <= yStop && this.ElementsAreEqual(xStop, yStop)) {
			this.resultX[xStop] = true;
			xStop--;
			this.resultY[yStop] = true;
			yStop--;
		}

		if (xStart > xStop || yStart > yStop) {
			return;
		}

		let found: number, i: number;
		if (xStart === xStop) {
			found = -1;
			for (i = yStart; i <= yStop; i++) {
				if (this.ElementsAreEqual(xStart, i)) {
					found = i;
					break;
				}
			}
			if (found >= 0) {
				this.resultX[xStart] = true;
				this.resultY[found] = true;
			}
		} else if (yStart === yStop) {
			found = -1;
			for (i = xStart; i <= xStop; i++) {
				if (this.ElementsAreEqual(i, yStart)) {
					found = i;
					break;
				}
			}

			if (found >= 0) {
				this.resultX[found] = true;
				this.resultY[yStart] = true;
			}
		} else {
			let middle = Math.floor((xStart + xStop) / 2);
			let cut = this.findCut(xStart, xStop, yStart, yStop, middle);

			if (yStart <= cut) {
				this.execute(xStart, middle, yStart, cut);
			}

			if (cut + 1 <= yStop) {
				this.execute(middle + 1, xStop, cut + 1, yStop);
			}
		}
	}

}
