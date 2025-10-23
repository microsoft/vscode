/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectedLines } from './folding.js';

export interface ILineRange {
	startLineNumber: number;
	endLineNumber: number;
}

export const enum FoldSource {
	provider = 0,
	userDefined = 1,
	recovered = 2
}

export const foldSourceAbbr = {
	[FoldSource.provider]: ' ',
	[FoldSource.userDefined]: 'u',
	[FoldSource.recovered]: 'r',
};

export interface FoldRange {
	startLineNumber: number;
	endLineNumber: number;
	type: string | undefined;
	isCollapsed: boolean;
	source: FoldSource;
}

export const MAX_FOLDING_REGIONS = 0xFFFF;
export const MAX_LINE_NUMBER = 0xFFFFFF;

const MASK_INDENT = 0xFF000000;

class BitField {
	private readonly _states: Uint32Array;
	constructor(size: number) {
		const numWords = Math.ceil(size / 32);
		this._states = new Uint32Array(numWords);
	}

	public get(index: number): boolean {
		const arrayIndex = (index / 32) | 0;
		const bit = index % 32;
		return (this._states[arrayIndex] & (1 << bit)) !== 0;
	}

	public set(index: number, newState: boolean) {
		const arrayIndex = (index / 32) | 0;
		const bit = index % 32;
		const value = this._states[arrayIndex];
		if (newState) {
			this._states[arrayIndex] = value | (1 << bit);
		} else {
			this._states[arrayIndex] = value & ~(1 << bit);
		}
	}
}

export class FoldingRegions {
	private readonly _startIndexes: Uint32Array;
	private readonly _endIndexes: Uint32Array;
	private readonly _collapseStates: BitField;
	private readonly _userDefinedStates: BitField;
	private readonly _recoveredStates: BitField;

	private _parentsComputed: boolean;
	private readonly _types: Array<string | undefined> | undefined;

	constructor(startIndexes: Uint32Array, endIndexes: Uint32Array, types?: Array<string | undefined>) {
		if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
			throw new Error('invalid startIndexes or endIndexes size');
		}
		this._startIndexes = startIndexes;
		this._endIndexes = endIndexes;
		this._collapseStates = new BitField(startIndexes.length);
		this._userDefinedStates = new BitField(startIndexes.length);
		this._recoveredStates = new BitField(startIndexes.length);
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
		return this._collapseStates.get(index);
	}

	public setCollapsed(index: number, newState: boolean) {
		this._collapseStates.set(index, newState);
	}

	private isUserDefined(index: number): boolean {
		return this._userDefinedStates.get(index);
	}

	private setUserDefined(index: number, newState: boolean) {
		return this._userDefinedStates.set(index, newState);
	}

	private isRecovered(index: number): boolean {
		return this._recoveredStates.get(index);
	}

	private setRecovered(index: number, newState: boolean) {
		return this._recoveredStates.set(index, newState);
	}

	public getSource(index: number): FoldSource {
		if (this.isUserDefined(index)) {
			return FoldSource.userDefined;
		} else if (this.isRecovered(index)) {
			return FoldSource.recovered;
		}
		return FoldSource.provider;
	}

	public setSource(index: number, source: FoldSource): void {
		if (source === FoldSource.userDefined) {
			this.setUserDefined(index, true);
			this.setRecovered(index, false);
		} else if (source === FoldSource.recovered) {
			this.setUserDefined(index, false);
			this.setRecovered(index, true);
		} else {
			this.setUserDefined(index, false);
			this.setRecovered(index, false);
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
			res[i] = `[${foldSourceAbbr[this.getSource(i)]}${this.isCollapsed(i) ? '+' : '-'}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`;
		}
		return res.join(', ');
	}

	public toFoldRange(index: number): FoldRange {
		return {
			startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
			endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
			type: this._types ? this._types[index] : undefined,
			isCollapsed: this.isCollapsed(index),
			source: this.getSource(index)
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
			regions.setSource(i, ranges[i].source);
		}
		return regions;
	}

	/**
	 * Two inputs, each a FoldingRegions or a FoldRange[], are merged.
	 * Each input must be pre-sorted on startLineNumber.
	 * The first list is assumed to always include all regions currently defined by range providers.
	 * The second list only contains the previously collapsed and all manual ranges.
	 * If the line position matches, the range of the new range is taken, and the range is no longer manual
	 * When an entry in one list overlaps an entry in the other, the second list's entry "wins" and
	 * overlapping entries in the first list are discarded.
	 * Invalid entries are discarded. An entry is invalid if:
	 * 		the start and end line numbers aren't a valid range of line numbers,
	 * 		it is out of sequence or has the same start line as a preceding entry,
	 * 		it overlaps a preceding entry and is not fully contained by that entry.
	 */
	public static sanitizeAndMerge(
		rangesA: FoldingRegions | FoldRange[],
		rangesB: FoldingRegions | FoldRange[],
		maxLineNumber: number | undefined,
		selection?: SelectedLines
	): FoldRange[] {

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

		const stackedRanges: FoldRange[] = [];
		let topStackedRange: FoldRange | undefined;
		let prevLineNumber = 0;
		const resultRanges: FoldRange[] = [];

		while (nextA || nextB) {

			let useRange: FoldRange | undefined = undefined;
			if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
				if (nextA && nextA.startLineNumber === nextB.startLineNumber) {
					if (nextB.source === FoldSource.userDefined) {
						// a user defined range (possibly unfolded)
						useRange = nextB;
					} else {
						// a previously folded range or a (possibly unfolded) recovered range
						useRange = nextA;
						// stays collapsed if the range still has the same number of lines or the selection is not in the range or after it
						useRange.isCollapsed = nextB.isCollapsed && (nextA.endLineNumber === nextB.endLineNumber || !selection?.startsInside(nextA.startLineNumber + 1, nextA.endLineNumber + 1));
						useRange.source = FoldSource.provider;
					}
					nextA = getA(++indexA); // not necessary, just for speed
				} else {
					useRange = nextB;
					if (nextB.isCollapsed && nextB.source === FoldSource.provider) {
						// a previously collapsed range
						useRange.source = FoldSource.recovered;
					}
				}
				nextB = getB(++indexB);
			} else {
				// nextA is next. The user folded B set takes precedence and we sometimes need to look
				// ahead in it to check for an upcoming conflict.
				let scanIndex = indexB;
				let prescanB = nextB;
				while (true) {
					if (!prescanB || prescanB.startLineNumber > nextA!.endLineNumber) {
						useRange = nextA;
						break; // no conflict, use this nextA
					}
					if (prescanB.source === FoldSource.userDefined && prescanB.endLineNumber > nextA!.endLineNumber) {
						// we found a user folded range, it wins
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
