/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch } from '../../../base/common/arrays.js';

export class SpecialLineHeights {

	public specialLineHeights: Map<string, number>;
	public maximumHeight: number;
	public prefixSum: number;

	constructor(prefixSum: number, specialLineHeights: Map<string, number>) {
		// prefix sum is never recomputed which is incorrect!
		this.prefixSum = prefixSum;
		this.specialLineHeights = specialLineHeights;
		this.maximumHeight = this._recomputeMaximumHeight();
	}

	public get decorationIds(): string[] {
		return Array.from(this.specialLineHeights.keys());
	}

	public get numberOfSpecialLineHeights(): number {
		return this.specialLineHeights.size;
	}

	/**
	 * Inserts a special line height, returns whether the maximum line height on the given line has changed
	 */
	public insert(decorationId: string, height: number): boolean {
		this.specialLineHeights.set(decorationId, height);
		const previousMaximumHeight = this.maximumHeight;
		this.maximumHeight = Math.max(this.maximumHeight, height);
		return previousMaximumHeight !== this.maximumHeight;
	}

	/**
	 * Deletes a special line height, returns whether the maximum line height on the given line has changed
	 */
	public delete(decorationId: string): boolean {
		const previousMaximumHeight = this.maximumHeight;
		if (this.specialLineHeights.has(decorationId)) {
			const height = this.specialLineHeights.get(decorationId)!;
			this.specialLineHeights.delete(decorationId);
			if (height === this.maximumHeight) {
				this.maximumHeight = this._recomputeMaximumHeight();
			}
		}
		return previousMaximumHeight !== this.maximumHeight;
	}

	private _recomputeMaximumHeight(): number {
		let maximumSpecialLineHeight = 0;
		this.specialLineHeights.forEach((specialLineHeight) => {
			maximumSpecialLineHeight = Math.max(maximumSpecialLineHeight, specialLineHeight);
		});
		return maximumSpecialLineHeight;
	}
}

export class SpecialLineHeightsManager {

	private _decorationIDToLineNumber: Map<string, number>;
	private _lineNumberToSpecialLineHeights: Map<number, SpecialLineHeights>;
	private _sortedSpecialLineNumbers: number[];
	private _defaultLineHeight: number;


	constructor(defaultLineHeight: number, other?: SpecialLineHeightsManager) {
		this._decorationIDToLineNumber = other?.decorationIDToLineNumber ? new Map(other.decorationIDToLineNumber) : new Map<string, number>();
		this._lineNumberToSpecialLineHeights = other?.lineNumberToSpecialLineHeights ? new Map(other.lineNumberToSpecialLineHeights) : new Map<number, SpecialLineHeights>();
		this._sortedSpecialLineNumbers = other?.sortedSpecialLineNumbers ? [...other.sortedSpecialLineNumbers] : [];
		this._defaultLineHeight = defaultLineHeight;
	}

	get decorationIDToLineNumber(): Map<string, number> {
		return this._decorationIDToLineNumber;
	}

	get lineNumberToSpecialLineHeights(): Map<number, SpecialLineHeights> {
		return this._lineNumberToSpecialLineHeights;
	}

	get sortedSpecialLineNumbers(): number[] {
		return this._sortedSpecialLineNumbers;
	}

	set defaultLineHeight(lineHeight: number) {
		this._defaultLineHeight = lineHeight;
	}

	public removeSpecialLineHeightUsingLineNumber(lineNumber: number): void {
		const specialLineHeights = this._lineNumberToSpecialLineHeights.get(lineNumber);
		if (!specialLineHeights) {
			return;
		}
		this._lineNumberToSpecialLineHeights.delete(lineNumber);
		for (const decoration of specialLineHeights.decorationIds) {
			this._decorationIDToLineNumber.delete(decoration);
		}
		const index = binarySearch(this._sortedSpecialLineNumbers, lineNumber, (a, b) => a - b);
		if (index >= 0) {
			this._sortedSpecialLineNumbers.splice(index, 1);
		}
	}

	public replaceSpecialLineHeightsFromLineNumbers(lineNumber1: number, lineNumber2: number): void {
		const specialLineHeights = this._lineNumberToSpecialLineHeights.get(lineNumber1);
		if (!specialLineHeights) {
			return;
		}
		this._lineNumberToSpecialLineHeights.delete(lineNumber1);
		this._lineNumberToSpecialLineHeights.set(lineNumber2, specialLineHeights);
		for (const decoration of specialLineHeights.decorationIds) {
			this._decorationIDToLineNumber.set(decoration, lineNumber2);
		}
		const index1 = binarySearch(this._sortedSpecialLineNumbers, lineNumber1, (a, b) => a - b);
		if (index1 >= 0) {
			this._sortedSpecialLineNumbers.splice(index1, 1);
		}
		const index2 = binarySearch(this._sortedSpecialLineNumbers, lineNumber2, (a, b) => a - b);
		if (index2 < 0) {
			this._sortedSpecialLineNumbers.splice(-(index2 + 1), 0, lineNumber2);
		}
	}

	public changeSpecialLineHeightUsingDecorationID(decorationId: string, lineNumber: number, lineHeight: number): void {
		this.removeSpecialLineHeightUsingDecorationID(decorationId);
		this.insertSpecialLineHeightUsingDecorationID(decorationId, lineNumber, lineHeight);
	}


	public removeSpecialLineHeightUsingDecorationID(decorationId: string): void {
		const correspondingLineNumber = this._decorationIDToLineNumber.get(decorationId);
		if (correspondingLineNumber === undefined) {
			return;
		}
		const specialLineHeights = this._lineNumberToSpecialLineHeights.get(correspondingLineNumber)!;
		specialLineHeights.delete(decorationId);
		if (specialLineHeights.numberOfSpecialLineHeights === 0) {
			this._lineNumberToSpecialLineHeights.delete(correspondingLineNumber);
			const index = binarySearch(this._sortedSpecialLineNumbers, correspondingLineNumber, (a, b) => a - b);
			if (index >= 0) {
				this._sortedSpecialLineNumbers.splice(index, 1);
			}
			this._decorationIDToLineNumber.delete(decorationId);
		}
	}

	public insertSpecialLineHeightUsingDecorationID(decorationId: string, lineNumber: number, lineHeight: number): void {
		this._decorationIDToLineNumber.set(decorationId, lineNumber);
		const specialLineHeights = this._lineNumberToSpecialLineHeights.get(lineNumber);
		if (specialLineHeights) {
			specialLineHeights.insert(decorationId, lineHeight);
		} else {
			this._lineNumberToSpecialLineHeights.set(lineNumber, new SpecialLineHeights(0, new Map<string, number>([[decorationId, lineHeight]])));
		}
		const index = binarySearch(this._sortedSpecialLineNumbers, lineNumber, (a, b) => a - b);
		if (index < 0) {
			this._sortedSpecialLineNumbers.splice(-(index + 1), 0, lineNumber);
		}
	}

	public lineHeightForLineNumber(lineNumber: number): number {
		return this._lineNumberToSpecialLineHeights.get(lineNumber)?.maximumHeight ?? this._defaultLineHeight;
	}

	public lineHeightUntilLineNumber(lineNumber: number): number {
		const smallestSpecialLine = this._smallestSpecialLineBefore(lineNumber);
		if (smallestSpecialLine === -1) {
			// no special line before
			return this._defaultLineHeight * lineNumber;
		}
		return this._lineNumberToSpecialLineHeights.get(smallestSpecialLine)!.prefixSum + this._defaultLineHeight * (lineNumber - smallestSpecialLine);
	}

	private _smallestSpecialLineBefore(lineNumber: number): number {
		const index = binarySearch(this._sortedSpecialLineNumbers, lineNumber, (a, b) => a - b);
		if (index >= 0) {
			return lineNumber;
		}
		if (index === -1) {
			return -1;
		}
		return this._sortedSpecialLineNumbers[-(index + 1) - 1];
	}
}
