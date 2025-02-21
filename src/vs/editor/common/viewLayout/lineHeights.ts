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
			return this._insertSpecialLineHeight(decorationId, lineNumber, lineHeight);
		}
		specialLine.lineNumber = lineNumber;
		specialLine.specialHeight = lineHeight;
		this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		this._hasPending = true;
	}

	private _insertSpecialLineHeight(decorationId: string, lineNumber: number, specialHeight: number): void {
		const specialLine = new SpecialLine(decorationId, -1, lineNumber, specialHeight, 0);
		this._pendingSpecialLinesToInsert.push(specialLine);
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
		this.commit();
		const startIndexOfDeletion = this._binarySearchOverSpecialLinesArray(fromLineNumber);
		let modifiedStartIndexOfDeletion: number;
		if (startIndexOfDeletion >= 0) {
			modifiedStartIndexOfDeletion = startIndexOfDeletion;
			for (let i = startIndexOfDeletion - 1; i >= 0; i--) {
				if (this._orderedSpecialLines[i].lineNumber === fromLineNumber) {
					modifiedStartIndexOfDeletion--;
				} else {
					break;
				}
			}
			// remove one because this one will be deleted
			modifiedStartIndexOfDeletion--;
		} else {
			modifiedStartIndexOfDeletion = -(startIndexOfDeletion + 1);
		}
		const endIndexOfDeletion = this._binarySearchOverSpecialLinesArray(toLineNumber);
		let modifiedEndIndexOfDeletion: number;
		if (endIndexOfDeletion >= 0) {
			modifiedEndIndexOfDeletion = endIndexOfDeletion;
			for (let i = endIndexOfDeletion + 1; i < this._orderedSpecialLines.length; i++) {
				if (this._orderedSpecialLines[i].lineNumber === fromLineNumber) {
					modifiedEndIndexOfDeletion++;
				} else {
					break;
				}
			}
			// remove one because this one will be deleted
			modifiedEndIndexOfDeletion++;
		} else {
			modifiedEndIndexOfDeletion = -(endIndexOfDeletion + 1);
		}

		this._orderedSpecialLines.splice(modifiedStartIndexOfDeletion, modifiedEndIndexOfDeletion - modifiedStartIndexOfDeletion);

		const numberOfDeletedLines = toLineNumber - fromLineNumber + 1;
		for (let i = modifiedStartIndexOfDeletion; i < this._orderedSpecialLines.length; i++) {
			this._orderedSpecialLines[i].lineNumber -= numberOfDeletedLines;
		}
	}

	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this.commit();
		const searchIndex = this._binarySearchOverSpecialLinesArray(fromLineNumber + 1);
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
		const numberOfInsertedLines = (toLineNumber - fromLineNumber + 1);
		for (let i = startIndex; i < this._orderedSpecialLines.length; i++) {
			this._orderedSpecialLines[i].lineNumber += numberOfInsertedLines;
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
			const searchIndex = this._binarySearchOverSpecialLinesArray(pendingChange.lineNumber);
			const modifiedSearchInde = searchIndex >= 0 ? searchIndex : -(searchIndex + 1);
			this._orderedSpecialLines.splice(modifiedSearchInde, 0, pendingChange);
			this._invalidIndex = Math.min(this._invalidIndex, modifiedSearchInde);
		}
		this._pendingSpecialLinesToInsert = [];
		const newDecorationIDToSpecialLineMap = new Map<string, SpecialLine>(this._decorationIDToSpecialLine);
		const newOrderedSpecialLines: SpecialLine[] = [];

		let numberOfDeletions = 0;
		for (let i = 0; i < this._invalidIndex; i++) {
			const specialLine = this._orderedSpecialLines[i];
			newOrderedSpecialLines.push(specialLine);
		}

		for (let i = this._invalidIndex; i < this._orderedSpecialLines.length; i++) {
			const specialLine = this._orderedSpecialLines[i];
			if (specialLine.deleted) {
				numberOfDeletions++;
				continue;
			}
			const previousSpecialLine: SpecialLine | undefined = i > 0 ? this._orderedSpecialLines[i - 1] : undefined;
			specialLine.index = i - numberOfDeletions;
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
			}
			newOrderedSpecialLines.push(specialLine);
			newDecorationIDToSpecialLineMap.set(specialLine.decorationId, specialLine);
		}
		this._orderedSpecialLines = newOrderedSpecialLines;
		this._decorationIDToSpecialLine = newDecorationIDToSpecialLineMap;
		this._invalidIndex = Infinity;
		this._hasPending = false;
	}
}
