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

	private _decorationIDToCustomLine: Map<string, CustomLine[]> = new Map<string, CustomLine[]>();
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
		const searchIndex = this._binarySearchOverCustomLinesOrderedArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedCustomLines[searchIndex].maximumSpecialHeight;
		}
		return this._defaultLineHeight;
	}

	public getAccumulatedLineHeightsIncludingLineNumber(lineNumber: number): number {
		this.commit();
		const searchIndex = this._binarySearchOverCustomLinesOrderedArray(lineNumber);
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
		const candidateStartIndexOfDeletion = this._binarySearchOverCustomLinesOrderedArray(fromLineNumber);
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
		const candidateEndIndexOfDeletionExclusive = this._binarySearchOverCustomLinesOrderedArray(toLineNumber);
		let endIndexOfDeletionExclusive: number;
		if (candidateEndIndexOfDeletionExclusive >= 0) {
			endIndexOfDeletionExclusive = candidateEndIndexOfDeletionExclusive;
			for (let i = candidateEndIndexOfDeletionExclusive + 1; i < this._orderedCustomLines.length; i++) {
				if (this._orderedCustomLines[i].lineNumber === toLineNumber) {
					endIndexOfDeletionExclusive++;
				} else {
					break;
				}
			}
		} else {
			endIndexOfDeletionExclusive = -(candidateEndIndexOfDeletionExclusive + 1);
		}
		if (endIndexOfDeletionExclusive > startIndexOfDeletion) {
			let maximumSpecialHeightOnDeletedInterval = 0;
			for (let i = startIndexOfDeletion; i < endIndexOfDeletionExclusive; i++) {
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
			const lastSpecialLineDeleted = this._orderedCustomLines[endIndexOfDeletionExclusive - 1];
			const firstSpecialLineAfterDeletion = this._orderedCustomLines[endIndexOfDeletionExclusive];
			const heightOfFirstLineAfterDeletion = firstSpecialLineAfterDeletion && firstSpecialLineAfterDeletion.lineNumber === toLineNumber + 1 ? firstSpecialLineAfterDeletion.maximumSpecialHeight : this._defaultLineHeight;
			const totalHeightDeleted = lastSpecialLineDeleted.prefixSum
				+ lastSpecialLineDeleted.maximumSpecialHeight
				- firstSpecialLineDeleted.prefixSum
				+ this._defaultLineHeight * (toLineNumber - lastSpecialLineDeleted.lineNumber)
				+ this._defaultLineHeight * (firstSpecialLineDeleted.lineNumber - fromLineNumber)
				+ heightOfFirstLineAfterDeletion - maximumSpecialHeightOnDeletedInterval;

			for (let i = startIndexOfDeletion; i < this._orderedCustomLines.length; i++) {
				const specialLine = this._orderedCustomLines[i];
				if (i >= startIndexOfDeletion && i < endIndexOfDeletionExclusive) {
					specialLine.lineNumber = fromLineNumber;
					specialLine.prefixSum = prefixSumOnDeletedInterval;
					specialLine.maximumSpecialHeight = maximumSpecialHeightOnDeletedInterval;
				} else if (i >= endIndexOfDeletionExclusive) {
					specialLine.lineNumber -= deleteCount;
					specialLine.prefixSum -= totalHeightDeleted;
				}
			}
		} else {
			const totalHeightDeleted = deleteCount * this._defaultLineHeight;
			for (let i = endIndexOfDeletionExclusive; i < this._orderedCustomLines.length; i++) {
				const specialLine = this._orderedCustomLines[i];
				specialLine.lineNumber -= deleteCount;
				specialLine.prefixSum -= totalHeightDeleted;
			}
		}
	}

	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this.commit();
		const insertCount = toLineNumber - fromLineNumber + 1;
		const candidateStartIndexOfInsertion = this._binarySearchOverCustomLinesOrderedArray(fromLineNumber);
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
			const candidateInsertionIndex = this._binarySearchOverCustomLinesOrderedArray(pendingChange.lineNumber);
			const insertionIndex = candidateInsertionIndex >= 0 ? candidateInsertionIndex : -(candidateInsertionIndex + 1);
			this._orderedCustomLines.splice(insertionIndex, 0, pendingChange);
			this._invalidIndex = Math.min(this._invalidIndex, insertionIndex);
		}
		this._pendingSpecialLinesToInsert = [];
		const newDecorationIDToSpecialLine = new Map<string, CustomLine[]>();
		const newOrderedSpecialLines: CustomLine[] = [];

		for (let i = 0; i < this._invalidIndex; i++) {
			const customLine = this._orderedCustomLines[i];
			newOrderedSpecialLines.push(customLine);
			const customLines = newDecorationIDToSpecialLine.get(customLine.decorationId);
			if (!customLines) {
				newDecorationIDToSpecialLine.set(customLine.decorationId, [customLine]);
			} else {
				customLines.push(customLine);
			}
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
			const customLines = newDecorationIDToSpecialLine.get(customLine.decorationId);
			if (!customLines) {
				newDecorationIDToSpecialLine.set(customLine.decorationId, [customLine]);
			} else {
				customLines.push(customLine);
			}
		}
		this._orderedCustomLines = newOrderedSpecialLines;
		this._decorationIDToCustomLine = newDecorationIDToSpecialLine;
		this._invalidIndex = Infinity;
		this._hasPending = false;
	}

	private _binarySearchOverCustomLinesOrderedArray(lineNumber: number): number {
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
