/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from '../../../../util/vs/base/common/errors';

/**
 * Represents a re-arrangement of items in an array.
 */
export class Permutation {

	/**
	 * The index map describes the index in the original array.
	 *
	 * @example
	 * ```typescript
	 * const arr = [20, 10, 30];
	 *
	 * const arrSortedPermutation = new Permutation([1, 0, 2]);
	 * // though consider using `Permutation.createSortPermutation(arr, (a, b) => a - b)` for sorting permutations
	 * ```
	 */
	constructor(private readonly _indexMap: readonly number[]) { }

	get arrayLength() {
		return this._indexMap.length;
	}

	/**
	 * Returns a permutation that sorts the given array according to the given compare function.
	 */
	public static createSortPermutation<T>(arr: readonly T[], compareFn: (a: T, b: T) => number): Permutation {
		const sortIndices = Array.from(arr.keys()).sort((index1, index2) => compareFn(arr[index1], arr[index2]));
		return new Permutation(sortIndices);
	}

	/**
	 * Returns a new array with the elements of the given array re-arranged according to this permutation.
	 */
	apply<T>(arr: readonly T[]): T[] {
		if (arr.length !== this.arrayLength) {
			throw illegalArgument(`Permutation must be applied on an array of same length. Received length: ${arr.length}. Expected length: ${this.arrayLength}`);
		}
		return arr.map((_, index) => arr[this._indexMap[index]]);
	}

	/**
	 * Given an index after permutation is, returns the index in the original array.
	 */
	mapIndexBack(indexAfterShuffling: number): number {
		const originalArrIdx = this._indexMap.at(indexAfterShuffling);
		if (originalArrIdx === undefined) {
			throw illegalArgument(`Given index must be within original array length. Received: ${indexAfterShuffling}. Expected: 0 <= x < ${this.arrayLength}`);
		}
		return originalArrIdx;
	}

	/**
	 * Returns a new permutation that undoes the re-arrangement of this permutation.
	*/
	inverse(): Permutation {
		const inverseIndexMap = this._indexMap.slice();
		for (let i = 0; i < this._indexMap.length; i++) {
			inverseIndexMap[this._indexMap[i]] = i;
		}
		return new Permutation(inverseIndexMap);
	}
}
