/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { arrayInsert } from '../../../base/common/arrays.js';
import { toUint32 } from '../../../base/common/uint.js';

export class PrefixSumComputer {

	/**
	 * values[i] is the value at index i
	 */
	private values: Uint32Array;

	/**
	 * prefixSum[i] = SUM(heights[j]), 0 <= j <= i
	 */
	private prefixSum: Uint32Array;

	/**
	 * prefixSum[i], 0 <= i <= prefixSumValidIndex can be trusted
	 */
	private readonly prefixSumValidIndex: Int32Array;

	constructor(values: Uint32Array) {
		this.values = values;
		this.prefixSum = new Uint32Array(values.length);
		this.prefixSumValidIndex = new Int32Array(1);
		this.prefixSumValidIndex[0] = -1;
	}

	public getCount(): number {
		return this.values.length;
	}

	public insertValues(insertIndex: number, insertValues: Uint32Array): boolean {
		insertIndex = toUint32(insertIndex);
		const oldValues = this.values;
		const oldPrefixSum = this.prefixSum;
		const insertValuesLen = insertValues.length;

		if (insertValuesLen === 0) {
			return false;
		}

		this.values = new Uint32Array(oldValues.length + insertValuesLen);
		this.values.set(oldValues.subarray(0, insertIndex), 0);
		this.values.set(oldValues.subarray(insertIndex), insertIndex + insertValuesLen);
		this.values.set(insertValues, insertIndex);

		if (insertIndex - 1 < this.prefixSumValidIndex[0]) {
			this.prefixSumValidIndex[0] = insertIndex - 1;
		}

		this.prefixSum = new Uint32Array(this.values.length);
		if (this.prefixSumValidIndex[0] >= 0) {
			this.prefixSum.set(oldPrefixSum.subarray(0, this.prefixSumValidIndex[0] + 1));
		}
		return true;
	}

	public setValue(index: number, value: number): boolean {
		index = toUint32(index);
		value = toUint32(value);

		if (this.values[index] === value) {
			return false;
		}
		this.values[index] = value;
		if (index - 1 < this.prefixSumValidIndex[0]) {
			this.prefixSumValidIndex[0] = index - 1;
		}
		return true;
	}

	public removeValues(startIndex: number, count: number): boolean {
		startIndex = toUint32(startIndex);
		count = toUint32(count);

		const oldValues = this.values;
		const oldPrefixSum = this.prefixSum;

		if (startIndex >= oldValues.length) {
			return false;
		}

		const maxCount = oldValues.length - startIndex;
		if (count >= maxCount) {
			count = maxCount;
		}

		if (count === 0) {
			return false;
		}

		this.values = new Uint32Array(oldValues.length - count);
		this.values.set(oldValues.subarray(0, startIndex), 0);
		this.values.set(oldValues.subarray(startIndex + count), startIndex);

		this.prefixSum = new Uint32Array(this.values.length);
		if (startIndex - 1 < this.prefixSumValidIndex[0]) {
			this.prefixSumValidIndex[0] = startIndex - 1;
		}
		if (this.prefixSumValidIndex[0] >= 0) {
			this.prefixSum.set(oldPrefixSum.subarray(0, this.prefixSumValidIndex[0] + 1));
		}
		return true;
	}

	public getTotalSum(): number {
		if (this.values.length === 0) {
			return 0;
		}
		return this._getPrefixSum(this.values.length - 1);
	}

	/**
	 * Returns the sum of the first `index + 1` many items.
	 * @returns `SUM(0 <= j <= index, values[j])`.
	 */
	public getPrefixSum(index: number): number {
		if (index < 0) {
			return 0;
		}

		index = toUint32(index);
		return this._getPrefixSum(index);
	}

	private _getPrefixSum(index: number): number {
		if (index <= this.prefixSumValidIndex[0]) {
			return this.prefixSum[index];
		}

		let startIndex = this.prefixSumValidIndex[0] + 1;
		if (startIndex === 0) {
			this.prefixSum[0] = this.values[0];
			startIndex++;
		}

		if (index >= this.values.length) {
			index = this.values.length - 1;
		}

		for (let i = startIndex; i <= index; i++) {
			this.prefixSum[i] = this.prefixSum[i - 1] + this.values[i];
		}
		this.prefixSumValidIndex[0] = Math.max(this.prefixSumValidIndex[0], index);
		return this.prefixSum[index];
	}

	public getIndexOf(sum: number): PrefixSumIndexOfResult {
		sum = Math.floor(sum);

		// Compute all sums (to get a fully valid prefixSum)
		this.getTotalSum();

		let low = 0;
		let high = this.values.length - 1;
		let mid = 0;
		let midStop = 0;
		let midStart = 0;

		while (low <= high) {
			mid = low + ((high - low) / 2) | 0;

			midStop = this.prefixSum[mid];
			midStart = midStop - this.values[mid];

			if (sum < midStart) {
				high = mid - 1;
			} else if (sum >= midStop) {
				low = mid + 1;
			} else {
				break;
			}
		}

		return new PrefixSumIndexOfResult(mid, sum - midStart);
	}
}

/**
 * {@link getIndexOf} has an amortized runtime complexity of O(1).
 *
 * ({@link PrefixSumComputer.getIndexOf} is just  O(log n))
*/
export class ConstantTimePrefixSumComputer {
	private _values: number[];
	private _isValid: boolean;
	private _validEndIndex: number;

	/**
	 * _prefixSum[i] = SUM(values[j]), 0 <= j <= i
	 */
	private _prefixSum: number[];

	/**
	 * _indexBySum[sum] = idx => _prefixSum[idx - 1] <= sum < _prefixSum[idx]
	*/
	private _indexBySum: number[];

	constructor(values: number[]) {
		this._values = values;
		this._isValid = false;
		this._validEndIndex = -1;
		this._prefixSum = [];
		this._indexBySum = [];
	}

	/**
	 * @returns SUM(0 <= j < values.length, values[j])
	 */
	public getTotalSum(): number {
		this._ensureValid();
		return this._indexBySum.length;
	}

	/**
	 * Returns the sum of the first `count` many items.
	 * @returns `SUM(0 <= j < count, values[j])`.
	 */
	public getPrefixSum(count: number): number {
		this._ensureValid();
		if (count === 0) {
			return 0;
		}
		return this._prefixSum[count - 1];
	}

	/**
	 * @returns `result`, such that `getPrefixSum(result.index) + result.remainder = sum`
	 */
	public getIndexOf(sum: number): PrefixSumIndexOfResult {
		this._ensureValid();
		const idx = this._indexBySum[sum];
		const viewLinesAbove = idx > 0 ? this._prefixSum[idx - 1] : 0;
		return new PrefixSumIndexOfResult(idx, sum - viewLinesAbove);
	}

	public removeValues(start: number, deleteCount: number): void {
		this._values.splice(start, deleteCount);
		this._invalidate(start);
	}

	public insertValues(insertIndex: number, insertArr: number[]): void {
		this._values = arrayInsert(this._values, insertIndex, insertArr);
		this._invalidate(insertIndex);
	}

	private _invalidate(index: number): void {
		this._isValid = false;
		this._validEndIndex = Math.min(this._validEndIndex, index - 1);
	}

	private _ensureValid(): void {
		if (this._isValid) {
			return;
		}

		for (let i = this._validEndIndex + 1, len = this._values.length; i < len; i++) {
			const value = this._values[i];
			const sumAbove = i > 0 ? this._prefixSum[i - 1] : 0;

			this._prefixSum[i] = sumAbove + value;
			for (let j = 0; j < value; j++) {
				this._indexBySum[sumAbove + j] = i;
			}
		}

		// trim things
		this._prefixSum.length = this._values.length;
		this._indexBySum.length = this._prefixSum[this._prefixSum.length - 1];

		// mark as valid
		this._isValid = true;
		this._validEndIndex = this._values.length - 1;
	}

	public setValue(index: number, value: number): void {
		if (this._values[index] === value) {
			// no change
			return;
		}
		this._values[index] = value;
		this._invalidate(index);
	}
}


export class PrefixSumIndexOfResult {
	_prefixSumIndexOfResultBrand: void = undefined;

	constructor(
		public readonly index: number,
		public readonly remainder: number
	) {
		this.index = index;
		this.remainder = remainder;
	}
}
