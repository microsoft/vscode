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
		const specialLine = this._decorationIDToSpecialLine.get(decorationID);
		if (!specialLine) {
			return;
		}
		specialLine.deleted = true;
		// this._decorationIDToSpecialLine.delete(decorationID);
		this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		this._hasPending = true;
	}

	public changeSpecialLineHeightUsingDecoration(decorationId: string, lineHeight: number): void {
		const specialLine = this._decorationIDToSpecialLine.get(decorationId);
		if (!specialLine) {
			return;
		}
		specialLine.specialHeight = lineHeight;
		this._invalidIndex = Math.min(this._invalidIndex, specialLine.index);
		this._hasPending = true;
	}

	public insertSpecialLineHeight(decorationId: string, lineNumber: number, specialHeight: number): void {
		const specialLine = new SpecialLine(decorationId, -1, lineNumber, specialHeight, 0);
		this._pendingSpecialLinesToInsert.push(specialLine);
		this._hasPending = true;
	}

	public heightForLineNumber(lineNumber: number): number {
		const searchIndex = this._binarySearchOverSpecialLinesArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedSpecialLines[searchIndex].maximumSpecialHeight;
		}
		return this._defaultLineHeight;
	}

	public totalHeightUntilLineNumber(lineNumber: number): number {
		const searchIndex = this._binarySearchOverSpecialLinesArray(lineNumber);
		if (searchIndex >= 0) {
			return this._orderedSpecialLines[searchIndex].prefixSum + this._orderedSpecialLines[searchIndex].maximumSpecialHeight;
		}
		const previousSpecialLine = this._orderedSpecialLines[-(searchIndex + 1) - 1];
		return previousSpecialLine.prefixSum + this._defaultLineHeight * (lineNumber - previousSpecialLine.lineNumber);
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
	}

	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
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
	}

	public mustCommit(): boolean {
		return this._hasPending;
	}

	public commit(): void {
		// insert the special lines and then update all of the prefix sums
		for (let i = this._invalidIndex; i <= this._orderedSpecialLines.length; i++) {
			// need to reconcile the data
		}

		/*
		public _commitPendingSpecialLineHeightChanges(inserts: { decorationId: string; lineNumber: number; lineHeight: number }[], changes: { decorationId: string; lineNumber: number; lineHeight: number }[], removes: { decorationId: string }[]): void {

			if (inserts.length + changes.length + removes.length <= 1) {
				for (const insert of inserts) {
					this._specialLineHeightsManager.insertSpecialLineHeightUsingDecorationID(insert.decorationId, insert.lineNumber, insert.lineHeight);
				}
				for (const change of changes) {
					this._specialLineHeightsManager.changeSpecialLineHeightUsingDecorationID(change.decorationId, change.lineNumber, change.lineHeight);
				}
				for (const remove of removes) {
					this._specialLineHeightsManager.removeSpecialLineHeightUsingDecorationID(remove.decorationId);
				}
				return;
			}

			const newSpecialLineHeightsManager = new LineHeightManager(this._lineHeight, this._specialLineHeightsManager);

			changes.forEach((change) => {
				newSpecialLineHeightsManager.changeSpecialLineHeightUsingDecorationID(change.decorationId, change.lineNumber, change.lineHeight);
				inserts.forEach((value) => {
					if (value.decorationId === change.decorationId) {
						value.lineNumber = change.lineNumber;
						value.lineHeight = change.lineHeight;
					}
				});
			});

			const filteredInserts: { decorationId: string; lineNumber: number; lineHeight: number }[] = inserts;
			removes.forEach((removal) => {
				newSpecialLineHeightsManager.removeSpecialLineHeightUsingDecorationID(removal.decorationId);
				inserts.filter((insert) => insert.decorationId !== removal.decorationId);
			});

			filteredInserts.forEach((insert) => {
				newSpecialLineHeightsManager.insertSpecialLineHeightUsingDecorationID(insert.decorationId, insert.lineNumber, insert.lineHeight);
			});

			this._specialLineHeightsManager = newSpecialLineHeightsManager;
			this._prefixSumSpecialLineHeightsValidIndex = -1;
		}
		*/
	}
}
