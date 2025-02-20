/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch2 } from '../../../base/common/arrays.js';


export class SpecialLine {

	public index: number;
	public lineNumber: number;
	public specialHeight: number;
	public prefixSum: number;
	public maximumSpecialHeight: number;
	public decorationId: string;

	// default initializations
	public deleted: boolean = false;
	public lineDelta: number = 0;

	constructor(decorationId: string, index: number, lineNumber: number, specialHeight: number, prefixSum: number) {
		this.decorationId = decorationId;
		this.index = index;
		this.lineNumber = lineNumber;
		this.specialHeight = specialHeight;
		this.prefixSum = prefixSum;
		this.maximumSpecialHeight = specialHeight;
	}
}

export class LineHeightManager {

	private _decorationIDToSpecialLine: Map<string, SpecialLine> = new Map<string, SpecialLine>();
	private _orderedSpecialLines: SpecialLine[] = [];
	private _pendingSpecialLinesToInsert: SpecialLine[] = [];
	private _invalidIndex: number = 0;
	private _defaultLineHeight: number;
	private _hasPending: boolean = false;

	constructor(defaultLineHeight: number) {
		this._defaultLineHeight = defaultLineHeight;
	}

	set defaultLineHeight(defaultLineHeight: number) {
		this._defaultLineHeight = defaultLineHeight;
	}

	public removeSpecialLineUsingDecoration(decorationID: string): void {
		// console.log('removeSpecialLineUsingDecoration', decorationID);
		const specialLine = this._decorationIDToSpecialLine.get(decorationID);
		if (!specialLine) {
			return;
		}
		specialLine.deleted = true;
		this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		this._hasPending = true;
	}

	public insertOrChangeSpecialLineHeightUsingDecoration(decorationId: string, lineNumber: number, lineHeight: number): void {
		// console.log('insertOrChangeSpecialLineHeightUsingDecoration', decorationId, lineNumber, lineHeight);
		const specialLine = this._decorationIDToSpecialLine.get(decorationId);
		if (!specialLine) {
			return this._insertSpecialLineHeight(decorationId, lineNumber, lineHeight);
		}
		specialLine.lineNumber = lineNumber;
		specialLine.specialHeight = lineHeight;
		this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		this._hasPending = true;
	}

	private _insertSpecialLineHeight(decorationId: string, lineNumber: number, specialHeight: number): void {
		// console.log('_insertSpecialLineHeight', decorationId, lineNumber, specialHeight);
		const specialLine = new SpecialLine(decorationId, -1, lineNumber, specialHeight, 0);
		this._pendingSpecialLinesToInsert.push(specialLine);
		this._hasPending = true;
	}

	public heightForLineNumber(lineNumber: number): number {
		// console.log('heightForLineNumber', lineNumber);
		const searchIndex = this._binarySearchOverSpecialLinesArray(lineNumber);
		if (searchIndex >= 0) {
			const specialHeight = this._orderedSpecialLines[searchIndex].maximumSpecialHeight;
			// console.log('specialHeight', specialHeight);
			return specialHeight;
		}
		// console.log('defaultLineHeight', this._defaultLineHeight);
		return this._defaultLineHeight;
	}

	public totalHeightUntilLineNumber(lineNumber: number): number {
		// console.log('totalHeightUntilLineNumber', lineNumber);
		const searchIndex = this._binarySearchOverSpecialLinesArray(lineNumber);
		// console.log('searchIndex', searchIndex);
		if (searchIndex >= 0) {
			const totalHeight = this._orderedSpecialLines[searchIndex].prefixSum + this._orderedSpecialLines[searchIndex].maximumSpecialHeight;
			// console.log('totalHeight', totalHeight);
			return totalHeight;
		}
		if (searchIndex === -1) {
			const totalHeight = this._defaultLineHeight * lineNumber;
			// console.log('totalHeight', totalHeight);
			return totalHeight;
		}
		const previousSpecialLine = this._orderedSpecialLines[-(searchIndex + 1) - 1];
		// console.log('previousSpecialLine', previousSpecialLine);
		const totalHeight = previousSpecialLine.prefixSum + this._orderedSpecialLines[searchIndex].maximumSpecialHeight + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
		// console.log('totalHeight', totalHeight);
		return totalHeight;
	}

	private _binarySearchOverSpecialLinesArray(lineNumber: number): number {
		return binarySearch2(this._orderedSpecialLines.length, (index) => {
			const line = this._orderedSpecialLines[index];
			if (line.lineNumber === lineNumber) {
				return 0;
			} else if (line.lineNumber < lineNumber) {
				return -1;
			} else {
				return 1;
			}
		});
	}

	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		// console.log('onLinesDeleted', fromLineNumber, toLineNumber);
		// console.log('this._orderedSpecialLines', JSON.stringify(this._orderedSpecialLines));
		const searchIndex = this._binarySearchOverSpecialLinesArray(fromLineNumber);
		let startIndex: number;
		if (searchIndex >= 0) {
			startIndex = searchIndex;
			// Need to find first that corresponds to that line number
			for (let i = searchIndex - 1; i >= 0; i--) {
				if (this._orderedSpecialLines[i].lineNumber === fromLineNumber) {
					startIndex--;
				} else {
					break;
				}
			}
		} else {
			startIndex = -(searchIndex + 1);
		}
		for (let i = startIndex; i < this._orderedSpecialLines.length; i++) {
			if (i <= toLineNumber) {
				this._orderedSpecialLines[i].deleted = true;
			} else {
				this._orderedSpecialLines[i].lineDelta -= (toLineNumber - fromLineNumber + 1);
			}
		}
		// console.log('this._orderedSpecialLines', JSON.stringify(this._orderedSpecialLines));
		// console.log('this._orderedSpecialLines', this._orderedSpecialLines);
	}

	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		// console.log('onLinesInserted', fromLineNumber, toLineNumber);
		// console.log('this._orderedSpecialLines', JSON.stringify(this._orderedSpecialLines));
		const searchIndex = this._binarySearchOverSpecialLinesArray(fromLineNumber);
		let startIndex: number;
		if (searchIndex >= 0) {
			startIndex = searchIndex;
			// Need to find first that corresponds to that line number
			for (let i = searchIndex - 1; i >= 0; i--) {
				if (this._orderedSpecialLines[i].lineNumber === fromLineNumber) {
					startIndex--;
				} else {
					break;
				}
			}
		} else {
			startIndex = -(searchIndex + 1);
		}
		for (let i = startIndex; i < this._orderedSpecialLines.length; i++) {
			this._orderedSpecialLines[i].lineDelta += (toLineNumber - fromLineNumber + 1);
		}
		// console.log('this._orderedSpecialLines', JSON.stringify(this._orderedSpecialLines));
	}

	public mustCommit(): boolean {
		return this._hasPending;
	}

	public commit(): void {
		if (!this._hasPending) {
			return;
		}

		// console.log('commit');
		// console.log('this._invalidIndex', this._invalidIndex);
		// console.log('this._pendingSpecialLinesToInsert', JSON.stringify(this._pendingSpecialLinesToInsert));
		for (const pendingChange of this._pendingSpecialLinesToInsert) {
			// console.log('pendingChange', pendingChange);
			const searchIndex = this._binarySearchOverSpecialLinesArray(pendingChange.lineNumber);
			// console.log('searchIndex', searchIndex);
			this._orderedSpecialLines.splice(searchIndex, 0, pendingChange);
			this._invalidIndex = Math.min(this._invalidIndex, searchIndex);
			// console.log('this._invalidIndex', this._invalidIndex);
		}
		this._pendingSpecialLinesToInsert = [];

		const newDecorationIDToSpecialLineMap = new Map<string, SpecialLine>(this._decorationIDToSpecialLine);
		const newOrderedSpecialLines: SpecialLine[] = [];
		let numberOfDeletions = 0;
		for (let i = this._invalidIndex; i <= this._orderedSpecialLines.length; i++) {
			// console.log('i : ', i);
			const specialLine = this._orderedSpecialLines[i];
			// console.log('specialLine : ', JSON.stringify(specialLine));
			// console.log('numberOfDeletions : ', numberOfDeletions);
			// console.log('specialLine.deleted : ', specialLine.deleted);
			if (specialLine.deleted) {
				numberOfDeletions++;
				newDecorationIDToSpecialLineMap.delete(specialLine.decorationId);
				// console.log('early return');
				continue;
			}
			const previousSpecialLine: SpecialLine | undefined = i > 0 ? this._orderedSpecialLines[i - 1] : undefined;
			// console.log('previousSpecialLine : ', previousSpecialLine);
			specialLine.index = i - numberOfDeletions;
			// console.log('specialLine.index : ', specialLine.index);
			specialLine.lineNumber += (specialLine.lineDelta - numberOfDeletions);
			// console.log('specialLine.lineNumber : ', specialLine.lineNumber);
			if (previousSpecialLine && previousSpecialLine.lineNumber === specialLine.lineNumber) {
				// console.log('first if');
				specialLine.maximumSpecialHeight = previousSpecialLine.maximumSpecialHeight;
				specialLine.prefixSum = previousSpecialLine.prefixSum;
			} else {
				// console.log('second else');
				let maximumSpecialHeight = specialLine.specialHeight;
				for (let j = i; j <= this._orderedSpecialLines.length; j++) {
					// console.log('j : ', j);
					const nextSpecialLine = this._orderedSpecialLines[j];
					// console.log('nextSpecialLine : ', nextSpecialLine);
					if (nextSpecialLine.deleted) {
						continue;
					}
					if (nextSpecialLine.lineNumber !== specialLine.lineNumber) {
						break;
					}
					maximumSpecialHeight = Math.max(maximumSpecialHeight, nextSpecialLine.specialHeight);
				}
				// console.log('maximumSpecialHeight : ', maximumSpecialHeight);
				specialLine.maximumSpecialHeight = maximumSpecialHeight;
				// console.log('specialLine.maximumSpecialHeight : ', specialLine.maximumSpecialHeight);
				specialLine.prefixSum = maximumSpecialHeight + (previousSpecialLine ? previousSpecialLine.prefixSum : 0);
				// console.log('specialLine.prefixSum : ', specialLine.prefixSum);
			}
			newOrderedSpecialLines.push(specialLine);
			newDecorationIDToSpecialLineMap.set(specialLine.decorationId, specialLine);
		}
		// console.log('newOrderedSpecialLines : ', newOrderedSpecialLines);
		// console.log('newDecorationIDToSpecialLineMap : ', newDecorationIDToSpecialLineMap);
		this._orderedSpecialLines = newOrderedSpecialLines;
		this._decorationIDToSpecialLine = newDecorationIDToSpecialLineMap;
		this._invalidIndex = Infinity;
		this._hasPending = false;
	}
}
