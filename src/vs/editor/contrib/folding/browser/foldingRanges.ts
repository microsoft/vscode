/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILineRange {
	startLineNumber: number;
	endLineNumber: number;
}

export interface FoldRange {
	startLineNumber: number;
	endLineNumber: number;
	isCollapsed: boolean;
	type: string | undefined;
}

export const MAX_FOLDING_REGIONS = 0xFFFF;
export const MAX_LINE_NUMBER = 0xFFFFFF;

const MASK_INDENT = 0xFF000000;

export class FoldingRegions {
	private readonly _startIndexes: Uint32Array;
	private readonly _endIndexes: Uint32Array;
	private readonly _collapseStates: Uint32Array;
	private _parentsComputed: boolean;
	private readonly _types: Array<string | undefined> | undefined;

	constructor(startIndexes: Uint32Array, endIndexes: Uint32Array, types?: Array<string | undefined>) {
		if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
			throw new Error('invalid startIndexes or endIndexes size');
		}
		this._startIndexes = startIndexes;
		this._endIndexes = endIndexes;
		this._collapseStates = new Uint32Array(Math.ceil(startIndexes.length / 32));
		this._types = types;
		this._parentsComputed = false;
	}

	private ensureParentIndices() {
		if (!this._parentsComputed) {
			this._parentsComputed = true;
			let parentIndexes: number[] = [];
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

	public getType(index: number): string | undefined {
		return this._types ? this._types[index] : undefined;
	}

	public hasTypes() {
		return !!this._types;
	}

	public isCollapsed(index: number): boolean {
		let arrayIndex = (index / 32) | 0;
		let bit = index % 32;
		return (this._collapseStates[arrayIndex] & (1 << bit)) !== 0;
	}

	public setCollapsed(index: number, newState: boolean) {
		let arrayIndex = (index / 32) | 0;
		let bit = index % 32;
		let value = this._collapseStates[arrayIndex];
		if (newState) {
			this._collapseStates[arrayIndex] = value | (1 << bit);
		} else {
			this._collapseStates[arrayIndex] = value & ~(1 << bit);
		}
	}

	public setCollapsedAllOfType(type: string, newState: boolean) {
		let hasChanged = false;
		if (this._types) {
			for (let i = 0; i < this._types.length; i++) {
				if (this._types[i] === type) {
					this.setCollapsed(i, newState);
					hasChanged = true;
				}
			}
		}
		return hasChanged;
	}

	public toRegion(index: number): FoldingRegion {
		return new FoldingRegion(this, index);
	}

	public getParentIndex(index: number) {
		this.ensureParentIndices();
		let parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
		if (parent === MAX_FOLDING_REGIONS) {
			return -1;
		}
		return parent;
	}

	public contains(index: number, line: number) {
		return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line;
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

	public toString() {
		let res: string[] = [];
		for (let i = 0; i < this.length; i++) {
			res[i] = `[${this.isCollapsed(i) ? '+' : '-'}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`;
		}
		return res.join(', ');
	}

	public equals(b: FoldingRegions) {
		if (this.length !== b.length) {
			return false;
		}

		for (let i = 0; i < this.length; i++) {
			if (this.getStartLineNumber(i) !== b.getStartLineNumber(i)) {
				return false;
			}
			if (this.getEndLineNumber(i) !== b.getEndLineNumber(i)) {
				return false;
			}
			if (this.getType(i) !== b.getType(i)) {
				return false;
			}
		}

		return true;
	}

	public toFoldRange(index: number): FoldRange {
		return <FoldRange>{
			startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
			endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
			isCollapsed: this.isCollapsed(index),
			type: this._types ? this._types[index] : undefined
		};
	}

	public static fromFoldRanges(ranges: FoldRange[]): FoldingRegions {
		const rangesLength = ranges.length;
		let startIndexes = new Uint32Array(rangesLength);
		let endIndexes = new Uint32Array(rangesLength);
		let types: Array<string | undefined> | undefined = [];
		let gotTypes = false;
		for (let i = 0; i < rangesLength; i++) {
			const range = ranges[i];
			startIndexes[i] = range.startLineNumber;
			endIndexes[i] = range.endLineNumber;
			types.push(range.type);
			if (range.type) {
				gotTypes = true;
			}
		}
		if (!gotTypes) {
			types = undefined;
		}
		const regions = new FoldingRegions(startIndexes, endIndexes, types);
		for (let i = 0; i < rangesLength; i++) {
			if (ranges[i].isCollapsed) {
				regions.setCollapsed(i, true);
			}
		}
		return regions;
	}

	/**
	 * Two inputs, each a FoldingRegions or a FoldRange[], are merged.
	 * Each input must be pre-sorted on startLineNumber.
	 * Where there's a conflict between the two inputs the second parameter's range is used.
	 * Invalid entries are discarded. An entry is invalid if:
	 * 		the start and end line numbers aren't a valid range of line numbers,
	 * 		it is out of sequence or has the same start line as a preceding entry,
	 * 		it overlaps a preceding entry and is not fully contained by that entry.
	 */
	public static sanitizeAndMerge(
		rangesA: FoldingRegions | FoldRange[],
		rangesB: FoldingRegions | FoldRange[],
		maxLineNumber: number | undefined): FoldRange[] {

		maxLineNumber = maxLineNumber ?? Number.MAX_VALUE;
		const getIndexedFunction = (r: FoldingRegions | FoldRange[], limit: number) => {
			return Array.isArray(r)
				? ((i: number) => { return (i < limit) ? r[i] : undefined; })
				: ((i: number) => { return (i < limit) ? r.toFoldRange(i) : undefined; });
		};
		const getA = getIndexedFunction(rangesA, rangesA.length);
		const getB = getIndexedFunction(rangesB, rangesB.length);
		let indexA = 0;
		let indexB = 0;
		let nextA = getA(0);
		let nextB = getB(0);

		let stackedRanges: FoldRange[] = [];
		let topStackedRange: FoldRange | undefined;
		let prevLineNumber = 0;
		let resultRanges: FoldRange[] = [];

		while (nextA || nextB) {

			let useRange: FoldRange | undefined = undefined;
			if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
				// nextB is next
				useRange = nextB;
				if (nextA
					&& nextA.startLineNumber === useRange.startLineNumber
					&& nextA.endLineNumber === useRange.endLineNumber) {
					// same range, merge the details
					useRange.isCollapsed = useRange.isCollapsed || nextA.isCollapsed;
					if (!useRange.type) {
						useRange.type = nextA.type;
					}
					nextA = getA(++indexA); // not necessary, just for speed
				}
				nextB = getB(++indexB);
			} else {
				// nextA is next. The B set takes precedence and we sometimes need to look
				// ahead in it to check for an upcoming conflict.
				let scanIndex = indexB;
				let prescanB = nextB;
				while (true) {
					if (!prescanB || prescanB.startLineNumber > nextA!.endLineNumber) {
						useRange = nextA;
						break; // no conflict, use this nextA
					}
					if (prescanB.endLineNumber > nextA!.endLineNumber) {
						break; // without setting nextResult, so this nextA gets skipped
					}
					prescanB = getB(++scanIndex);
				}
				nextA = getA(++indexA);
			}

			if (useRange) {
				while (topStackedRange
					&& topStackedRange.endLineNumber < useRange.startLineNumber) {
					topStackedRange = stackedRanges.pop();
				}
				if (useRange.endLineNumber > useRange.startLineNumber
					&& useRange.startLineNumber > prevLineNumber
					&& useRange.endLineNumber <= maxLineNumber
					&& (!topStackedRange
						|| topStackedRange.endLineNumber >= useRange.endLineNumber)) {
					resultRanges.push(useRange);
					prevLineNumber = useRange.startLineNumber;
					if (topStackedRange) {
						stackedRanges.push(topStackedRange);
					}
					topStackedRange = useRange;
				}
			}

		}
		return resultRanges;
	}

}

export class FoldingRegion {

	constructor(private readonly ranges: FoldingRegions, private index: number) {
	}

	public get startLineNumber() {
		return this.ranges.getStartLineNumber(this.index);
	}

	public get endLineNumber() {
		return this.ranges.getEndLineNumber(this.index);
	}

	public get regionIndex() {
		return this.index;
	}

	public get parentIndex() {
		return this.ranges.getParentIndex(this.index);
	}

	public get isCollapsed() {
		return this.ranges.isCollapsed(this.index);
	}

	containedBy(range: ILineRange): boolean {
		return range.startLineNumber <= this.startLineNumber && range.endLineNumber >= this.endLineNumber;
	}
	containsLine(lineNumber: number) {
		return this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber;
	}
	hidesLine(lineNumber: number) {
		return this.startLineNumber < lineNumber && lineNumber <= this.endLineNumber;
	}
}
