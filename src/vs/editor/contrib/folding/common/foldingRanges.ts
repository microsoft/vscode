/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface ILineRange {
	startLineNumber: number;
	endLineNumber: number;
}

export const MAX_FOLDING_REGIONS = 0xFFFF;
export const MAX_LINE_NUMBER = 0xFFFFFF;

const MASK_INDENT = 0xFF000000;

export class FoldingRanges {
	private _startIndexes: Uint32Array;
	private _endIndexes: Uint32Array;

	constructor(startIndexes: Uint32Array, endIndexes: Uint32Array) {
		if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
			throw new Error('invalid startIndexes or endIndexes size');
		}
		this._startIndexes = startIndexes;
		this._endIndexes = endIndexes;
		this._computeParentIndices();
	}

	private _computeParentIndices() {
		let parentIndexes = [];
		let isInsideLast = (startLineNumber: number, endLineNumber: number) => {
			let index = parentIndexes[parentIndexes.length - 1];
			return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
		};
		for (let i = 0, len = this._startIndexes.length; i < len; i++) {
			let startLineNumber = this._startIndexes[i];
			let endLineNumber = this._endIndexes[i];
			if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
				throw new Error('startLineNumber or endLineNumber must not exceed ' + MAX_LINE_NUMBER);
			}
			while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
				parentIndexes.pop();
			}
			let parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
			parentIndexes.push(i);
			this._startIndexes[i] = startLineNumber + ((parentIndex & 0xFF) << 24);
			this._endIndexes[i] = endLineNumber + ((parentIndex & 0xFF00) << 16);
		}
	}

	public get length(): number {
		return this._startIndexes.length;
	}

	public getStartLineNumber(index: number): number {
		return this._startIndexes[index] & MAX_LINE_NUMBER;
	}

	public getEndLineNumber(index: number): number {
		return this._endIndexes[index] & MAX_LINE_NUMBER;
	}

	public getParentIndex(index: number) {
		let parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
		if (parent === MAX_FOLDING_REGIONS) {
			return -1;
		}
		return parent;
	}

	public contains(index: number, line: number) {
		return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line;
	}

	isAfterLine(index: number, lineNumber: number): boolean {
		return lineNumber < this.getStartLineNumber(index);
	}
	isBeforeLine(index: number, lineNumber: number): boolean {
		return lineNumber > this.getEndLineNumber(index);
	}
	containsRange(index: number, range: ILineRange): boolean {
		return this.getStartLineNumber(index) <= range.startLineNumber && this.getEndLineNumber(index) >= range.endLineNumber;
	}
	containedBy(index: number, range: ILineRange): boolean {
		return range.startLineNumber <= this.getStartLineNumber(index) && range.endLineNumber >= this.getEndLineNumber(index);
	}
	containsLine(index: number, lineNumber: number) {
		return this.getStartLineNumber(index) <= lineNumber && lineNumber <= this.getEndLineNumber(index);
	}
	hidesLine(index: number, lineNumber: number) {
		return this.getStartLineNumber(index) < lineNumber && lineNumber <= this.getEndLineNumber(index);
	}

	private findIndex(line: number) {
		let low = 0, high = this._startIndexes.length;
		if (high === 0) {
			return -1; // no children
		}
		while (low < high) {
			let mid = Math.floor((low + high) / 2);
			if (line < this.getStartLineNumber(mid)) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}
		return low - 1;
	}


	public findRange(line: number): number {
		let index = this.findIndex(line);
		if (index >= 0) {
			let endLineNumber = this.getEndLineNumber(index);
			if (endLineNumber >= line) {
				return index;
			}
			index = this.getParentIndex(index);
			while (index !== -1) {
				if (this.contains(index, line)) {
					return index;
				}
				index = this.getParentIndex(index);
			}
		}
		return -1;
	}
}