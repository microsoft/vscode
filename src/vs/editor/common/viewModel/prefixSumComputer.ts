/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface IPrefixSumIndexOfResult {
	index: number;
	remainder: number;
}

export class PrefixSumComputer {

	/**
	 * values[i] is the value at index i
	 */
	private values:number[];

	/**
	 * prefixSum[i] = SUM(heights[j]), 0 <= j <= i
	 */
	private prefixSum:number[];

	/**
	 * prefixSum[i], 0 <= i <= prefixSumValidIndex can be trusted
	 */
	private prefixSumValidIndex:number;

	constructor(values:number[]) {
		this.values = values;
		this.prefixSum = [];
		for (var i = 0, len = this.values.length; i < len; i++) {
			this.prefixSum[i] = 0;
		}
		this.prefixSumValidIndex = -1;
	}

	public getCount(): number {
		return this.values.length;
	}

	public insertValue(insertIndex:number, value:number): void {
		this.values.splice(insertIndex, 0, value);
		this.prefixSum.splice(insertIndex, 0, 0);
		if (insertIndex - 1 < this.prefixSumValidIndex) {
			this.prefixSumValidIndex = insertIndex - 1;
		}
	}

	public insertValues(insertIndex: number, values: number[]): void {
		if (values.length === 0) {
			return;
		}

		this.values = this.values.slice(0, insertIndex).concat(values).concat(this.values.slice(insertIndex));
		this.prefixSum = this.prefixSum.slice(0, insertIndex).concat(PrefixSumComputer._zeroArray(values.length)).concat(this.prefixSum.slice(insertIndex));

		if (insertIndex - 1 < this.prefixSumValidIndex) {
			this.prefixSumValidIndex = insertIndex - 1;
		}
	}

	private static _zeroArray(count: number): number[] {
		var r: number[] = new Array<number>(count);
		for (var i = 0; i < count; i++) {
			r[i] = 0;
		}
		return r;
	}

	public changeValue(index:number, value:number): void {
		if (this.values[index] === value) {
			return;
		}
		this.values[index] = value;
		if (index - 1 < this.prefixSumValidIndex) {
			this.prefixSumValidIndex = index - 1;
		}
	}

	public removeValues(startIndex:number, cnt:number): void {
		this.values.splice(startIndex, cnt);
		this.prefixSum.splice(startIndex, cnt);
		if (startIndex - 1 < this.prefixSumValidIndex) {
			this.prefixSumValidIndex = startIndex - 1;
		}
	}

	public getTotalValue(): number {
		if (this.values.length === 0) {
			return 0;
		}
		return this.getAccumulatedValue(this.values.length - 1);
	}

	public getAccumulatedValue(index:number): number {
		if (index < 0) {
			return 0;
		}
		if (index <= this.prefixSumValidIndex) {
			return this.prefixSum[index];
		}

		var startIndex = this.prefixSumValidIndex + 1;
		if (startIndex === 0) {
			this.prefixSum[0] = this.values[0];
			startIndex++;
		}

		if (index >= this.values.length) {
			index = this.values.length - 1;
		}

		for (var i = startIndex; i <= index; i++) {
			this.prefixSum[i] = this.prefixSum[i - 1] + this.values[i];
		}
		this.prefixSumValidIndex = Math.max(this.prefixSumValidIndex, index);
		return this.prefixSum[index];
	}

	public getIndexOf(accumulatedValue:number, result:IPrefixSumIndexOfResult): void {
		var low = 0,
			high = this.values.length - 1,
			mid:number,
			midStart:number,
			midStop:number;

		while (low <= high) {
			mid = low + ( (high-low)/2 ) | 0;

			midStop = this.getAccumulatedValue(mid);
			midStart = midStop - this.values[mid];

			if (accumulatedValue < midStart) {
				high = mid - 1;
			} else if (accumulatedValue >= midStop) {
				low = mid + 1;
			} else {
				break;
			}
		}

		result.index = mid;
		result.remainder = accumulatedValue - midStart;
	}
}