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
		const specialLine = this._decorationIDToSpecialLine.get(decorationID);
		if (!specialLine) {
			return;
		}
		this._decorationIDToSpecialLine.delete(decorationID);
		specialLine.deleted = true;
		this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		this._hasPending = true;
	}

	public insertOrChangeSpecialLineHeightUsingDecoration(decorationId: string, lineNumber: number, lineHeight: number): void {
		const specialLine = this._decorationIDToSpecialLine.get(decorationId);
		if (!specialLine) {
			const specialLine = new SpecialLine(decorationId, -1, lineNumber, lineHeight, 0);
			this._pendingSpecialLinesToInsert.push(specialLine);
		} else {
			specialLine.lineNumber = lineNumber;
			specialLine.specialHeight = lineHeight;
			this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		}
		this._hasPending = true;
	}

	public heightForLineNumber(lineNumber: number): number {
		this.commit();
		const searchIndex = this._binarySearchOverSpecialLinesArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedSpecialLines[searchIndex].maximumSpecialHeight;
		}
		return this._defaultLineHeight;
	}

	public totalHeightUntilLineNumber(lineNumber: number): number {
		this.commit();
		const searchIndex = this._binarySearchOverSpecialLinesArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedSpecialLines[searchIndex].prefixSum + this._orderedSpecialLines[searchIndex].maximumSpecialHeight;
		}
		if (searchIndex === -1) {
			return this._defaultLineHeight * lineNumber;
		}
		const modifiedIndex = -(searchIndex + 1);
		const previousSpecialLine = this._orderedSpecialLines[modifiedIndex - 1];
		return previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
	}

	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		this.commit();
		const deleteCount = toLineNumber - fromLineNumber + 1;
		const candidateStartIndexOfDeletion = this._binarySearchOverSpecialLinesArray(fromLineNumber);
		let startIndexOfDeletion: number;
		if (candidateStartIndexOfDeletion >= 0) {
			startIndexOfDeletion = candidateStartIndexOfDeletion;
			for (let i = candidateStartIndexOfDeletion - 1; i >= 0; i--) {
				if (this._orderedSpecialLines[i].lineNumber === fromLineNumber) {
					startIndexOfDeletion--;
				} else {
					break;
				}
			}
		} else {
			startIndexOfDeletion = -(candidateStartIndexOfDeletion + 1);
		}
		const candidateEndIndexOfDeletionExclusive = this._binarySearchOverSpecialLinesArray(toLineNumber);
		let endIndexOfDeletionExclusive: number;
		if (candidateEndIndexOfDeletionExclusive >= 0) {
			endIndexOfDeletionExclusive = candidateEndIndexOfDeletionExclusive;
			for (let i = candidateEndIndexOfDeletionExclusive + 1; i < this._orderedSpecialLines.length; i++) {
				if (this._orderedSpecialLines[i].lineNumber === toLineNumber) {
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
				maximumSpecialHeightOnDeletedInterval = Math.max(maximumSpecialHeightOnDeletedInterval, this._orderedSpecialLines[i].maximumSpecialHeight);
			}
			let prefixSumOnDeletedInterval = 0;
			if (startIndexOfDeletion > 0) {
				const previousSpecialLine = this._orderedSpecialLines[startIndexOfDeletion - 1];
				prefixSumOnDeletedInterval = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (fromLineNumber - previousSpecialLine.lineNumber - 1);
			} else {
				prefixSumOnDeletedInterval = fromLineNumber > 0 ? (fromLineNumber - 1) * this._defaultLineHeight : 0;
			}
			const firstSpecialLineDeleted = this._orderedSpecialLines[startIndexOfDeletion];
			const lastSpecialLineDeleted = this._orderedSpecialLines[endIndexOfDeletionExclusive - 1];
			const firstSpecialLineAfterDeletion = this._orderedSpecialLines[endIndexOfDeletionExclusive];
			const heightOfFirstLineAfterDeletion = firstSpecialLineAfterDeletion && firstSpecialLineAfterDeletion.lineNumber === toLineNumber + 1 ? firstSpecialLineAfterDeletion.maximumSpecialHeight : this._defaultLineHeight;
			const totalHeightDeleted = lastSpecialLineDeleted.prefixSum
				+ lastSpecialLineDeleted.maximumSpecialHeight
				- firstSpecialLineDeleted.prefixSum
				+ this._defaultLineHeight * (toLineNumber - lastSpecialLineDeleted.lineNumber)
				+ this._defaultLineHeight * (firstSpecialLineDeleted.lineNumber - fromLineNumber)
				+ heightOfFirstLineAfterDeletion - maximumSpecialHeightOnDeletedInterval;

			for (let i = startIndexOfDeletion; i < this._orderedSpecialLines.length; i++) {
				const specialLine = this._orderedSpecialLines[i];
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
			for (let i = endIndexOfDeletionExclusive; i < this._orderedSpecialLines.length; i++) {
				const specialLine = this._orderedSpecialLines[i];
				specialLine.lineNumber -= deleteCount;
				specialLine.prefixSum -= totalHeightDeleted;
			}
		}
	}

	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this.commit();
		const insertCount = toLineNumber - fromLineNumber + 1;
		const candidateStartIndexOfInsertion = this._binarySearchOverSpecialLinesArray(fromLineNumber);
		let startIndexOfInsertion: number;
		if (candidateStartIndexOfInsertion >= 0) {
			startIndexOfInsertion = candidateStartIndexOfInsertion;
			for (let i = candidateStartIndexOfInsertion - 1; i >= 0; i--) {
				if (this._orderedSpecialLines[i].lineNumber === fromLineNumber) {
					startIndexOfInsertion--;
				} else {
					break;
				}
			}
		} else {
			startIndexOfInsertion = -(candidateStartIndexOfInsertion + 1);
		}
		for (let i = startIndexOfInsertion; i < this._orderedSpecialLines.length; i++) {
			this._orderedSpecialLines[i].lineNumber += insertCount;
			this._orderedSpecialLines[i].prefixSum += this._defaultLineHeight * insertCount;
		}
	}


	public mustCommit(): boolean {
		return this._hasPending;
	}

	public commit(): void {
		if (!this._hasPending) {
			return;
		}
		for (const pendingChange of this._pendingSpecialLinesToInsert) {
			const candidateInsertionIndex = this._binarySearchOverSpecialLinesArray(pendingChange.lineNumber);
			const insertionIndex = candidateInsertionIndex >= 0 ? candidateInsertionIndex : -(candidateInsertionIndex + 1);
			this._orderedSpecialLines.splice(insertionIndex, 0, pendingChange);
			this._invalidIndex = Math.min(this._invalidIndex, insertionIndex);
		}
		this._pendingSpecialLinesToInsert = [];
		const newDecorationIDToSpecialLine = new Map<string, SpecialLine>();
		const newOrderedSpecialLines: SpecialLine[] = [];

		for (let i = 0; i < this._invalidIndex; i++) {
			const specialLine = this._orderedSpecialLines[i];
			newOrderedSpecialLines.push(specialLine);
			newDecorationIDToSpecialLine.set(specialLine.decorationId, specialLine);
		}

		let numberOfDeletions = 0;
		for (let i = this._invalidIndex; i < this._orderedSpecialLines.length; i++) {
			const specialLine = this._orderedSpecialLines[i];
			if (specialLine.deleted) {
				numberOfDeletions++;
				continue;
			}
			specialLine.index = i - numberOfDeletions;
			const previousSpecialLine: SpecialLine | undefined = i > 0 ? this._orderedSpecialLines[i - 1] : undefined;
			if (previousSpecialLine && previousSpecialLine.lineNumber === specialLine.lineNumber) {
				specialLine.maximumSpecialHeight = previousSpecialLine.maximumSpecialHeight;
				specialLine.prefixSum = previousSpecialLine.prefixSum;
			} else {
				let maximumSpecialHeight = specialLine.specialHeight;
				for (let j = i; j < this._orderedSpecialLines.length; j++) {
					const nextSpecialLine = this._orderedSpecialLines[j];
					if (nextSpecialLine.deleted) {
						continue;
					}
					if (nextSpecialLine.lineNumber !== specialLine.lineNumber) {
						break;
					}
					maximumSpecialHeight = Math.max(maximumSpecialHeight, nextSpecialLine.specialHeight);
				}
				specialLine.maximumSpecialHeight = maximumSpecialHeight;

				let prefixSum: number;
				if (previousSpecialLine) {
					prefixSum = previousSpecialLine.prefixSum + previousSpecialLine.maximumSpecialHeight + this._defaultLineHeight * (specialLine.lineNumber - previousSpecialLine.lineNumber - 1);
				} else {
					prefixSum = this._defaultLineHeight * (specialLine.lineNumber - 1);
				}
				specialLine.prefixSum = prefixSum;
				// don't we want to update the line number too?
			}
			newOrderedSpecialLines.push(specialLine);
			newDecorationIDToSpecialLine.set(specialLine.decorationId, specialLine);
		}
		this._orderedSpecialLines = newOrderedSpecialLines;
		this._decorationIDToSpecialLine = newDecorationIDToSpecialLine;
		this._invalidIndex = Infinity;
		this._hasPending = false;
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
}
