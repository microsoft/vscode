/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch2 } from '../../../base/common/arrays.js';


export class CustomLine {

	public index: number;
	public lineNumber: number;
	public specialHeight: number;
	public prefixSum: number;
	public maximumSpecialHeight: number;
	public decorationId: string;
	public deleted: boolean;

	constructor(decorationId: string, index: number, lineNumber: number, specialHeight: number, prefixSum: number) {
		this.decorationId = decorationId;
		this.index = index;
		this.lineNumber = lineNumber;
		this.specialHeight = specialHeight;
		this.prefixSum = prefixSum;
		this.maximumSpecialHeight = specialHeight;
		this.deleted = false;
	}
}

export class LineHeightsManager {

	private _decorationIDToCustomLine: ArrayMap<string, CustomLine> = new ArrayMap<string, CustomLine>();
	private _orderedCustomLines: CustomLine[] = [];
	private _pendingSpecialLinesToInsert: CustomLine[] = [];
	private _invalidIndex: number = 0;
	private _defaultLineHeight: number;
	private _hasPending: boolean = false;

	constructor(defaultLineHeight: number) {
		this._defaultLineHeight = defaultLineHeight;
	}

	set defaultLineHeight(defaultLineHeight: number) {
		this._defaultLineHeight = defaultLineHeight;
	}

	public removeCustomLineHeight(decorationID: string): void {
		const customLines = this._decorationIDToCustomLine.get(decorationID);
		if (!customLines) {
			return;
		}
		this._decorationIDToCustomLine.delete(decorationID);
		for (const customLine of customLines) {
			customLine.deleted = true;
			this._invalidIndex = Math.min(this._invalidIndex, customLine.index);
		}
		this._hasPending = true;
	}

	public insertOrChangeCustomLineHeight(decorationId: string, startLineNumber: number, endLineNumber: number, lineHeight: number): void {
		this.removeCustomLineHeight(decorationId);
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const customLine = new CustomLine(decorationId, -1, lineNumber, lineHeight, 0);
			this._pendingSpecialLinesToInsert.push(customLine);
		}
		this._hasPending = true;
	}

	public heightForLineNumber(lineNumber: number): number {
		this.commit();
		const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedCustomLines[searchIndex].maximumSpecialHeight;
		}
		return this._defaultLineHeight;
	}

	public getAccumulatedLineHeightsIncludingLineNumber(lineNumber: number): number {
		this.commit();
		const searchIndex = this._binarySearchOverOrderedCustomLinesArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedCustomLines[searchIndex].prefixSum + this._orderedCustomLines[searchIndex].maximumSpecialHeight;
		}
		if (searchIndex === -1) {
			return this._defaultLineHeight * lineNumber;
		}
		const modifiedIndex = -(searchIndex + 1);
		const previousSpecialLine = this._orderedCustomLines[modifiedIndex - 1];
		return previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
	}

	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		this.commit();
		const deleteCount = toLineNumber - fromLineNumber + 1;
		const candidateStartIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
		let startIndexOfDeletion: number;
		if (candidateStartIndexOfDeletion >= 0) {
			startIndexOfDeletion = candidateStartIndexOfDeletion;
			for (let i = candidateStartIndexOfDeletion - 1; i >= 0; i--) {
				if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
					startIndexOfDeletion--;
				} else {
					break;
				}
			}
		} else {
			startIndexOfDeletion = -(candidateStartIndexOfDeletion + 1);
		}
		const candidateEndIndexOfDeletion = this._binarySearchOverOrderedCustomLinesArray(toLineNumber);
		let endIndexOfDeletion: number;
		if (candidateEndIndexOfDeletion >= 0) {
			endIndexOfDeletion = candidateEndIndexOfDeletion;
			for (let i = candidateEndIndexOfDeletion + 1; i < this._orderedCustomLines.length; i++) {
				if (this._orderedCustomLines[i].lineNumber === toLineNumber) {
					endIndexOfDeletion++;
				} else {
					break;
				}
			}
		} else {
			endIndexOfDeletion = -(candidateEndIndexOfDeletion > -1 ? candidateEndIndexOfDeletion + 2 : 0);
		}
		const isEndIndexBiggerThanStartIndex = endIndexOfDeletion > startIndexOfDeletion;
		const isEndIndexEqualToStartIndexAndCoversCustomLine = endIndexOfDeletion === startIndexOfDeletion
			&& this._orderedCustomLines[startIndexOfDeletion]
			&& this._orderedCustomLines[startIndexOfDeletion].lineNumber >= fromLineNumber
			&& this._orderedCustomLines[startIndexOfDeletion].lineNumber <= toLineNumber;

		if (isEndIndexBiggerThanStartIndex || isEndIndexEqualToStartIndexAndCoversCustomLine) {
			let maximumSpecialHeightOnDeletedInterval = 0;
			for (let i = startIndexOfDeletion; i <= endIndexOfDeletion; i++) {
				maximumSpecialHeightOnDeletedInterval = Math.max(maximumSpecialHeightOnDeletedInterval, this._orderedCustomLines[i].maximumSpecialHeight);
			}
			let prefixSumOnDeletedInterval = 0;
			if (startIndexOfDeletion > 0) {
				const previousSpecialLine = this._orderedCustomLines[startIndexOfDeletion - 1];
				prefixSumOnDeletedInterval = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (fromLineNumber - previousSpecialLine.lineNumber - 1);
			} else {
				prefixSumOnDeletedInterval = fromLineNumber > 0 ? (fromLineNumber - 1) * this._defaultLineHeight : 0;
			}
			const firstSpecialLineDeleted = this._orderedCustomLines[startIndexOfDeletion];
			const lastSpecialLineDeleted = this._orderedCustomLines[endIndexOfDeletion];
			const firstSpecialLineAfterDeletion = this._orderedCustomLines[endIndexOfDeletion + 1];
			const heightOfFirstLineAfterDeletion = firstSpecialLineAfterDeletion && firstSpecialLineAfterDeletion.lineNumber === toLineNumber + 1 ? firstSpecialLineAfterDeletion.maximumSpecialHeight : this._defaultLineHeight;
			const totalHeightDeleted = lastSpecialLineDeleted.prefixSum
				+ lastSpecialLineDeleted.maximumSpecialHeight
				- firstSpecialLineDeleted.prefixSum
				+ this._defaultLineHeight * (toLineNumber - lastSpecialLineDeleted.lineNumber)
				+ this._defaultLineHeight * (firstSpecialLineDeleted.lineNumber - fromLineNumber)
				+ heightOfFirstLineAfterDeletion - maximumSpecialHeightOnDeletedInterval;

			const decorationIdsSeen = new Set<string>();
			const newOrderedCustomLines: CustomLine[] = [];
			const newDecorationIDToSpecialLine = new ArrayMap<string, CustomLine>();
			let numberOfDeletions = 0;
			for (let i = 0; i < this._orderedCustomLines.length; i++) {
				const customLine = this._orderedCustomLines[i];
				if (i < startIndexOfDeletion) {
					newOrderedCustomLines.push(customLine);
					newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
				} else if (i >= startIndexOfDeletion && i <= endIndexOfDeletion) {
					const decorationId = customLine.decorationId;
					if (!decorationIdsSeen.has(decorationId)) {
						customLine.index -= numberOfDeletions;
						customLine.lineNumber = fromLineNumber;
						customLine.prefixSum = prefixSumOnDeletedInterval;
						customLine.maximumSpecialHeight = maximumSpecialHeightOnDeletedInterval;
						newOrderedCustomLines.push(customLine);
						newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
					} else {
						numberOfDeletions++;
					}
				} else if (i > endIndexOfDeletion) {
					customLine.index -= numberOfDeletions;
					customLine.lineNumber -= deleteCount;
					customLine.prefixSum -= totalHeightDeleted;
					newOrderedCustomLines.push(customLine);
					newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
				}
				decorationIdsSeen.add(customLine.decorationId);
			}
			this._orderedCustomLines = newOrderedCustomLines;
			this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
		} else {
			const totalHeightDeleted = deleteCount * this._defaultLineHeight;
			for (let i = endIndexOfDeletion; i < this._orderedCustomLines.length; i++) {
				const specialLine = this._orderedCustomLines[i];
				specialLine.lineNumber -= deleteCount;
				specialLine.prefixSum -= totalHeightDeleted;
			}
		}
	}

	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this.commit();
		const insertCount = toLineNumber - fromLineNumber + 1;
		const candidateStartIndexOfInsertion = this._binarySearchOverOrderedCustomLinesArray(fromLineNumber);
		let startIndexOfInsertion: number;
		if (candidateStartIndexOfInsertion >= 0) {
			startIndexOfInsertion = candidateStartIndexOfInsertion;
			for (let i = candidateStartIndexOfInsertion - 1; i >= 0; i--) {
				if (this._orderedCustomLines[i].lineNumber === fromLineNumber) {
					startIndexOfInsertion--;
				} else {
					break;
				}
			}
		} else {
			startIndexOfInsertion = -(candidateStartIndexOfInsertion + 1);
		}
		for (let i = startIndexOfInsertion; i < this._orderedCustomLines.length; i++) {
			this._orderedCustomLines[i].lineNumber += insertCount;
			this._orderedCustomLines[i].prefixSum += this._defaultLineHeight * insertCount;
		}
	}

	public commit(): void {
		if (!this._hasPending) {
			return;
		}
		for (const pendingChange of this._pendingSpecialLinesToInsert) {
			const candidateInsertionIndex = this._binarySearchOverOrderedCustomLinesArray(pendingChange.lineNumber);
			const insertionIndex = candidateInsertionIndex >= 0 ? candidateInsertionIndex : -(candidateInsertionIndex + 1);
			this._orderedCustomLines.splice(insertionIndex, 0, pendingChange);
			this._invalidIndex = Math.min(this._invalidIndex, insertionIndex);
		}
		this._pendingSpecialLinesToInsert = [];
		const newDecorationIDToSpecialLine = new ArrayMap<string, CustomLine>();
		const newOrderedSpecialLines: CustomLine[] = [];

		for (let i = 0; i < this._invalidIndex; i++) {
			const customLine = this._orderedCustomLines[i];
			newOrderedSpecialLines.push(customLine);
			newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
		}

		let numberOfDeletions = 0;
		let previousSpecialLine: CustomLine | undefined = (this._invalidIndex > 0) ? newOrderedSpecialLines[this._invalidIndex - 1] : undefined;
		for (let i = this._invalidIndex; i < this._orderedCustomLines.length; i++) {
			const customLine = this._orderedCustomLines[i];
			if (customLine.deleted) {
				numberOfDeletions++;
				continue;
			}
			customLine.index = i - numberOfDeletions;
			if (previousSpecialLine && previousSpecialLine.lineNumber === customLine.lineNumber) {
				customLine.maximumSpecialHeight = previousSpecialLine.maximumSpecialHeight;
				customLine.prefixSum = previousSpecialLine.prefixSum;
			} else {
				let maximumSpecialHeight = customLine.specialHeight;
				for (let j = i; j < this._orderedCustomLines.length; j++) {
					const nextSpecialLine = this._orderedCustomLines[j];
					if (nextSpecialLine.deleted) {
						continue;
					}
					if (nextSpecialLine.lineNumber !== customLine.lineNumber) {
						break;
					}
					maximumSpecialHeight = Math.max(maximumSpecialHeight, nextSpecialLine.specialHeight);
				}
				customLine.maximumSpecialHeight = maximumSpecialHeight;

				let prefixSum: number;
				if (previousSpecialLine) {
					prefixSum = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (customLine.lineNumber - previousSpecialLine.lineNumber - 1);
				} else {
					prefixSum = this._defaultLineHeight * (customLine.lineNumber - 1);
				}
				customLine.prefixSum = prefixSum;
			}
			previousSpecialLine = customLine;
			newOrderedSpecialLines.push(customLine);
			newDecorationIDToSpecialLine.add(customLine.decorationId, customLine);
		}
		this._orderedCustomLines = newOrderedSpecialLines;
		this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
		this._invalidIndex = Infinity;
		this._hasPending = false;
	}

	private _binarySearchOverOrderedCustomLinesArray(lineNumber: number): number {
		return binarySearch2(this._orderedCustomLines.length, (index) => {
			const line = this._orderedCustomLines[index];
			if (line.lineNumber === lineNumber) {
				return 0;
			} else if (line.lineNumber < lineNumber) {
				return -1;
			} else {
				return 1;
			}
		});
	}
}

class ArrayMap<K, T> {

	private _map: Map<K, T[]> = new Map<K, T[]>();

	constructor() { }

	add(key: K, value: T) {
		const array = this._map.get(key);
		if (!array) {
			this._map.set(key, [value]);
		} else {
			array.push(value);
		}
	}

	get(key: K): T[] | undefined {
		return this._map.get(key);
	}

	delete(key: K): void {
		this._map.delete(key);
	}
}
