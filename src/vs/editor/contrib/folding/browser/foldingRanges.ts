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
	type: string | undefined;
	isCollapsed: boolean;
	isManualSelection: boolean;
}

export const MAX_FOLDING_REGIONS = 0xFFFF;
export const MAX_LINE_NUMBER = 0xFFFFFF;

const MASK_INDENT = 0xFF000000;

export class FoldingRegions {
	private readonly _startIndexes: Uint32Array;
	private readonly _endIndexes: Uint32Array;
	private readonly _collapseStates: Uint32Array;
	private readonly _manualStates: Uint32Array;
	private _parentsComputed: boolean;
	private readonly _types: Array<string | undefined> | undefined;

	constructor(startIndexes: Uint32Array, endIndexes: Uint32Array, types?: Array<string | undefined>) {
		if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
			throw new Error('invalid startIndexes or endIndexes size');
		}
		this._startIndexes = startIndexes;
		this._endIndexes = endIndexes;
		const numWords = Math.ceil(startIndexes.length / 32);
		this._collapseStates = new Uint32Array(numWords);
		this._manualStates = new Uint32Array(numWords);
		this._types = types;
		this._parentsComputed = false;
	}

	private ensureParentIndices() {
		if (!this._parentsComputed) {
			this._parentsComputed = true;
			const parentIndexes: number[] = [];
			const isInsideLast = (startLineNumber: number, endLineNumber: number) => {
				const index = parentIndexes[parentIndexes.length - 1];
				return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
			};
			for (let i = 0, len = this._startIndexes.length; i < len; i++) {
				const startLineNumber = this._startIndexes[i];
				const endLineNumber = this._endIndexes[i];
				if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
					throw new Error('startLineNumber or endLineNumber must not exceed ' + MAX_LINE_NUMBER);
				}
				while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
					parentIndexes.pop();
				}
				const parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
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
		const arrayIndex = (index / 32) | 0;
		const bit = index % 32;
		return (this._collapseStates[arrayIndex] & (1 << bit)) !== 0;
	}

	public setCollapsed(index: number, newState: boolean) {
		const arrayIndex = (index / 32) | 0;
		const bit = index % 32;
		const value = this._collapseStates[arrayIndex];
		if (newState) {
			this._collapseStates[arrayIndex] = value | (1 << bit);
		} else {
			this._collapseStates[arrayIndex] = value & ~(1 << bit);
		}
	}

	public isManualSelection(index: number): boolean {
		const arrayIndex = (index / 32) | 0;
		const bit = index % 32;
		return (this._manualStates[arrayIndex] & (1 << bit)) !== 0;
	}

	public setManualSelection(index: number, newState: boolean) {
		const arrayIndex = (index / 32) | 0;
		const bit = index % 32;
		const value = this._manualStates[arrayIndex];
		if (newState) {
			this._manualStates[arrayIndex] = value | (1 << bit);
		} else {
			this._manualStates[arrayIndex] = value & ~(1 << bit);
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
		const parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
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
			const mid = Math.floor((low + high) / 2);
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
			const endLineNumber = this.getEndLineNumber(index);
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
		const res: string[] = [];
		for (let i = 0; i < this.length; i++) {
			res[i] = `[${this.isManualSelection(i) ? '*' : ' '}${this.isCollapsed(i) ? '+' : '-'}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`;
		}
		return res.join(', ');
	}

	public toFoldRange(index: number): FoldRange {
		return <FoldRange>{
			startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
			endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
			type: this._types ? this._types[index] : undefined,
			isCollapsed: this.isCollapsed(index),
			isManualSelection: this.isManualSelection(index)
		};
	}

	public static fromFoldRanges(ranges: FoldRange[]): FoldingRegions {
		const rangesLength = ranges.length;
		const startIndexes = new Uint32Array(rangesLength);
		const endIndexes = new Uint32Array(rangesLength);
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
			if (ranges[i].isManualSelection) {
				regions.setManualSelection(i, true);
			}
		}
		return regions;
	}

	/**
	 * Two inputs, each a FoldingRegions or a FoldRange[], are merged.
	 * Each input must be pre-sorted on startLineNumber.
	 * The first list is assumed to always include all regions currently defined by range providers.
	 * The second list only contains hidden ranges.
	 * When an entry in one list overlaps an entry in the other, the second list's entry "wins" and
	 * overlapping entries in the first list are discarded. With one exception: when there is just
	 * one such second list entry and it is not manual it is discarded, on the assumption that
	 * user editing has resulted in the range no longer existing.
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
		let result = this._trySanitizeAndMerge(1, rangesA, rangesB, maxLineNumber);
		if (!result) { // try again, converting hidden ranges to manually selected
			result = this._trySanitizeAndMerge(2, rangesA, rangesB, maxLineNumber);
		}
		return result!;
	}

	private static _trySanitizeAndMerge(
		passNumber: number, // it can take two passes to get this done
		rangesA: FoldingRegions | FoldRange[],
		rangesB: FoldingRegions | FoldRange[],
		maxLineNumber: number): FoldRange[] | null {

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

		const stackedRanges: FoldRange[] = [];
		let topStackedRange: FoldRange | undefined;
		let prevLineNumber = 0;
		const resultRanges: FoldRange[] = [];
		let numberAutoExpand = 0;

		while (nextA || nextB) {

			let useRange: FoldRange | undefined = undefined;
			if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
				// nextB is next
				if (nextA
					&& nextA.startLineNumber === nextB.startLineNumber
					&& nextA.endLineNumber === nextB.endLineNumber) {
					// same range in both lists, merge the details
					useRange = nextB;
					useRange.isCollapsed = useRange.isCollapsed || nextA.isCollapsed;
					// next line removes manual flag when range provider has matching range
					useRange.isManualSelection = nextA.isManualSelection && nextB.isManualSelection;
					if (!useRange.type) {
						useRange.type = nextA.type;
					}
					nextA = getA(++indexA); // not necessary, just for speed
				} else if (nextB.isCollapsed && !nextB.isManualSelection && passNumber === 1) {
					if (++numberAutoExpand > 1) {
						// do second pass keeping these, assuming something like an unmatched /*
						return null;
					}
					// skip nextB (auto expand) by not setting useRange, assuming it was edited
				} else { // use nextB
					useRange = nextB;
					if (useRange.isCollapsed) {
						// doesn't match nextA, convert to a manual selection if it wasn't already
						useRange.isManualSelection = true;
					}
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
					if (prescanB.endLineNumber > nextA!.endLineNumber
						&& (!prescanB.isCollapsed || prescanB.isManualSelection || passNumber === 2)) {
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
