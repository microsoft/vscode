/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffChange, ISequence, LcsDiff } from 'vs/base/common/diff/diff';
import * as strings from 'vs/base/common/strings';
import { ICharChange, ILineChange } from 'vs/editor/common/editorCommon';

const MAXIMUM_RUN_TIME = 5000; // 5 seconds
const MINIMUM_MATCHING_CHARACTER_LENGTH = 3;

function computeDiff(originalSequence: ISequence, modifiedSequence: ISequence, continueProcessingPredicate: () => boolean, pretty: boolean): IDiffChange[] {
	const diffAlgo = new LcsDiff(originalSequence, modifiedSequence, continueProcessingPredicate);
	return diffAlgo.ComputeDiff(pretty);
}

class LineMarkerSequence implements ISequence {

	private readonly _lines: string[];
	private readonly _startColumns: number[];
	private readonly _endColumns: number[];

	constructor(lines: string[]) {
		let startColumns: number[] = [];
		let endColumns: number[] = [];
		for (let i = 0, length = lines.length; i < length; i++) {
			startColumns[i] = LineMarkerSequence._getFirstNonBlankColumn(lines[i], 1);
			endColumns[i] = LineMarkerSequence._getLastNonBlankColumn(lines[i], 1);
		}
		this._lines = lines;
		this._startColumns = startColumns;
		this._endColumns = endColumns;
	}

	public getLength(): number {
		return this._lines.length;
	}

	public getElementAtIndex(i: number): string {
		return this._lines[i].substring(this._startColumns[i] - 1, this._endColumns[i] - 1);
	}

	public getStartLineNumber(i: number): number {
		return i + 1;
	}

	public getStartColumn(i: number): number {
		return this._startColumns[i];
	}

	public getEndLineNumber(i: number): number {
		return i + 1;
	}

	public getEndColumn(i: number): number {
		return this._endColumns[i];
	}

	public static _getFirstNonBlankColumn(txt: string, defaultValue: number): number {
		const r = strings.firstNonWhitespaceIndex(txt);
		if (r === -1) {
			return defaultValue;
		}
		return r + 1;
	}

	public static _getLastNonBlankColumn(txt: string, defaultValue: number): number {
		const r = strings.lastNonWhitespaceIndex(txt);
		if (r === -1) {
			return defaultValue;
		}
		return r + 2;
	}

	public getCharSequence(shouldIgnoreTrimWhitespace: boolean, startIndex: number, endIndex: number): CharSequence {
		let charCodes: number[] = [];
		let lineNumbers: number[] = [];
		let columns: number[] = [];
		let len = 0;
		for (let index = startIndex; index <= endIndex; index++) {
			const lineContent = this._lines[index];
			const startColumn = (shouldIgnoreTrimWhitespace ? this._startColumns[index] : 1);
			const endColumn = (shouldIgnoreTrimWhitespace ? this._endColumns[index] : lineContent.length + 1);
			for (let col = startColumn; col < endColumn; col++) {
				charCodes[len] = lineContent.charCodeAt(col - 1);
				lineNumbers[len] = index + 1;
				columns[len] = col;
				len++;
			}
		}
		return new CharSequence(charCodes, lineNumbers, columns);
	}
}

class CharSequence implements ISequence {

	private readonly _charCodes: number[];
	private readonly _lineNumbers: number[];
	private readonly _columns: number[];

	constructor(charCodes: number[], lineNumbers: number[], columns: number[]) {
		this._charCodes = charCodes;
		this._lineNumbers = lineNumbers;
		this._columns = columns;
	}

	public getLength(): number {
		return this._charCodes.length;
	}

	public getElementAtIndex(i: number): number {
		return this._charCodes[i];
	}

	public getStartLineNumber(i: number): number {
		return this._lineNumbers[i];
	}

	public getStartColumn(i: number): number {
		return this._columns[i];
	}

	public getEndLineNumber(i: number): number {
		return this._lineNumbers[i];
	}

	public getEndColumn(i: number): number {
		return this._columns[i] + 1;
	}
}

class CharChange implements ICharChange {

	public originalStartLineNumber: number;
	public originalStartColumn: number;
	public originalEndLineNumber: number;
	public originalEndColumn: number;

	public modifiedStartLineNumber: number;
	public modifiedStartColumn: number;
	public modifiedEndLineNumber: number;
	public modifiedEndColumn: number;

	constructor(
		originalStartLineNumber: number,
		originalStartColumn: number,
		originalEndLineNumber: number,
		originalEndColumn: number,
		modifiedStartLineNumber: number,
		modifiedStartColumn: number,
		modifiedEndLineNumber: number,
		modifiedEndColumn: number
	) {
		this.originalStartLineNumber = originalStartLineNumber;
		this.originalStartColumn = originalStartColumn;
		this.originalEndLineNumber = originalEndLineNumber;
		this.originalEndColumn = originalEndColumn;
		this.modifiedStartLineNumber = modifiedStartLineNumber;
		this.modifiedStartColumn = modifiedStartColumn;
		this.modifiedEndLineNumber = modifiedEndLineNumber;
		this.modifiedEndColumn = modifiedEndColumn;
	}

	public static createFromDiffChange(diffChange: IDiffChange, originalCharSequence: CharSequence, modifiedCharSequence: CharSequence): CharChange {
		let originalStartLineNumber: number;
		let originalStartColumn: number;
		let originalEndLineNumber: number;
		let originalEndColumn: number;
		let modifiedStartLineNumber: number;
		let modifiedStartColumn: number;
		let modifiedEndLineNumber: number;
		let modifiedEndColumn: number;

		if (diffChange.originalLength === 0) {
			originalStartLineNumber = 0;
			originalStartColumn = 0;
			originalEndLineNumber = 0;
			originalEndColumn = 0;
		} else {
			originalStartLineNumber = originalCharSequence.getStartLineNumber(diffChange.originalStart);
			originalStartColumn = originalCharSequence.getStartColumn(diffChange.originalStart);
			originalEndLineNumber = originalCharSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
			originalEndColumn = originalCharSequence.getEndColumn(diffChange.originalStart + diffChange.originalLength - 1);
		}

		if (diffChange.modifiedLength === 0) {
			modifiedStartLineNumber = 0;
			modifiedStartColumn = 0;
			modifiedEndLineNumber = 0;
			modifiedEndColumn = 0;
		} else {
			modifiedStartLineNumber = modifiedCharSequence.getStartLineNumber(diffChange.modifiedStart);
			modifiedStartColumn = modifiedCharSequence.getStartColumn(diffChange.modifiedStart);
			modifiedEndLineNumber = modifiedCharSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
			modifiedEndColumn = modifiedCharSequence.getEndColumn(diffChange.modifiedStart + diffChange.modifiedLength - 1);
		}

		return new CharChange(
			originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn,
			modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn,
		);
	}
}

function postProcessCharChanges(rawChanges: IDiffChange[]): IDiffChange[] {
	if (rawChanges.length <= 1) {
		return rawChanges;
	}

	let result = [rawChanges[0]];
	let prevChange = result[0];

	for (let i = 1, len = rawChanges.length; i < len; i++) {
		const currChange = rawChanges[i];

		const originalMatchingLength = currChange.originalStart - (prevChange.originalStart + prevChange.originalLength);
		const modifiedMatchingLength = currChange.modifiedStart - (prevChange.modifiedStart + prevChange.modifiedLength);
		// Both of the above should be equal, but the continueProcessingPredicate may prevent this from being true
		const matchingLength = Math.min(originalMatchingLength, modifiedMatchingLength);

		if (matchingLength < MINIMUM_MATCHING_CHARACTER_LENGTH) {
			// Merge the current change into the previous one
			prevChange.originalLength = (currChange.originalStart + currChange.originalLength) - prevChange.originalStart;
			prevChange.modifiedLength = (currChange.modifiedStart + currChange.modifiedLength) - prevChange.modifiedStart;
		} else {
			// Add the current change
			result.push(currChange);
			prevChange = currChange;
		}
	}

	return result;
}

class LineChange implements ILineChange {
	public originalStartLineNumber: number;
	public originalEndLineNumber: number;
	public modifiedStartLineNumber: number;
	public modifiedEndLineNumber: number;
	public charChanges: CharChange[] | undefined;

	constructor(
		originalStartLineNumber: number,
		originalEndLineNumber: number,
		modifiedStartLineNumber: number,
		modifiedEndLineNumber: number,
		charChanges: CharChange[] | undefined
	) {
		this.originalStartLineNumber = originalStartLineNumber;
		this.originalEndLineNumber = originalEndLineNumber;
		this.modifiedStartLineNumber = modifiedStartLineNumber;
		this.modifiedEndLineNumber = modifiedEndLineNumber;
		this.charChanges = charChanges;
	}

	public static createFromDiffResult(shouldIgnoreTrimWhitespace: boolean, diffChange: IDiffChange, originalLineSequence: LineMarkerSequence, modifiedLineSequence: LineMarkerSequence, continueProcessingPredicate: () => boolean, shouldComputeCharChanges: boolean, shouldPostProcessCharChanges: boolean): LineChange {
		let originalStartLineNumber: number;
		let originalEndLineNumber: number;
		let modifiedStartLineNumber: number;
		let modifiedEndLineNumber: number;
		let charChanges: CharChange[] | undefined = undefined;

		if (diffChange.originalLength === 0) {
			originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart) - 1;
			originalEndLineNumber = 0;
		} else {
			originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart);
			originalEndLineNumber = originalLineSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
		}

		if (diffChange.modifiedLength === 0) {
			modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart) - 1;
			modifiedEndLineNumber = 0;
		} else {
			modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart);
			modifiedEndLineNumber = modifiedLineSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
		}

		if (shouldComputeCharChanges && diffChange.originalLength !== 0 && diffChange.modifiedLength !== 0 && continueProcessingPredicate()) {
			const originalCharSequence = originalLineSequence.getCharSequence(shouldIgnoreTrimWhitespace, diffChange.originalStart, diffChange.originalStart + diffChange.originalLength - 1);
			const modifiedCharSequence = modifiedLineSequence.getCharSequence(shouldIgnoreTrimWhitespace, diffChange.modifiedStart, diffChange.modifiedStart + diffChange.modifiedLength - 1);

			let rawChanges = computeDiff(originalCharSequence, modifiedCharSequence, continueProcessingPredicate, true);

			if (shouldPostProcessCharChanges) {
				rawChanges = postProcessCharChanges(rawChanges);
			}

			charChanges = [];
			for (let i = 0, length = rawChanges.length; i < length; i++) {
				charChanges.push(CharChange.createFromDiffChange(rawChanges[i], originalCharSequence, modifiedCharSequence));
			}
		}

		return new LineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges);
	}
}

export interface IDiffComputerOpts {
	shouldComputeCharChanges: boolean;
	shouldPostProcessCharChanges: boolean;
	shouldIgnoreTrimWhitespace: boolean;
	shouldMakePrettyDiff: boolean;
}

export class DiffComputer {

	private readonly shouldComputeCharChanges: boolean;
	private readonly shouldPostProcessCharChanges: boolean;
	private readonly shouldIgnoreTrimWhitespace: boolean;
	private readonly shouldMakePrettyDiff: boolean;
	private readonly maximumRunTimeMs: number;
	private readonly originalLines: string[];
	private readonly modifiedLines: string[];
	private readonly original: LineMarkerSequence;
	private readonly modified: LineMarkerSequence;

	private computationStartTime: number;

	constructor(originalLines: string[], modifiedLines: string[], opts: IDiffComputerOpts) {
		this.shouldComputeCharChanges = opts.shouldComputeCharChanges;
		this.shouldPostProcessCharChanges = opts.shouldPostProcessCharChanges;
		this.shouldIgnoreTrimWhitespace = opts.shouldIgnoreTrimWhitespace;
		this.shouldMakePrettyDiff = opts.shouldMakePrettyDiff;
		this.maximumRunTimeMs = MAXIMUM_RUN_TIME;
		this.originalLines = originalLines;
		this.modifiedLines = modifiedLines;
		this.original = new LineMarkerSequence(originalLines);
		this.modified = new LineMarkerSequence(modifiedLines);

		this.computationStartTime = (new Date()).getTime();
	}

	public computeDiff(): ILineChange[] {

		if (this.original.getLength() === 1 && this.original.getElementAtIndex(0).length === 0) {
			// empty original => fast path
			return [{
				originalStartLineNumber: 1,
				originalEndLineNumber: 1,
				modifiedStartLineNumber: 1,
				modifiedEndLineNumber: this.modified.getLength(),
				charChanges: [{
					modifiedEndColumn: 0,
					modifiedEndLineNumber: 0,
					modifiedStartColumn: 0,
					modifiedStartLineNumber: 0,
					originalEndColumn: 0,
					originalEndLineNumber: 0,
					originalStartColumn: 0,
					originalStartLineNumber: 0
				}]
			}];
		}

		if (this.modified.getLength() === 1 && this.modified.getElementAtIndex(0).length === 0) {
			// empty modified => fast path
			return [{
				originalStartLineNumber: 1,
				originalEndLineNumber: this.original.getLength(),
				modifiedStartLineNumber: 1,
				modifiedEndLineNumber: 1,
				charChanges: [{
					modifiedEndColumn: 0,
					modifiedEndLineNumber: 0,
					modifiedStartColumn: 0,
					modifiedStartLineNumber: 0,
					originalEndColumn: 0,
					originalEndLineNumber: 0,
					originalStartColumn: 0,
					originalStartLineNumber: 0
				}]
			}];
		}

		this.computationStartTime = (new Date()).getTime();

		let rawChanges = computeDiff(this.original, this.modified, this._continueProcessingPredicate.bind(this), this.shouldMakePrettyDiff);

		// The diff is always computed with ignoring trim whitespace
		// This ensures we get the prettiest diff

		if (this.shouldIgnoreTrimWhitespace) {
			let lineChanges: LineChange[] = [];
			for (let i = 0, length = rawChanges.length; i < length; i++) {
				lineChanges.push(LineChange.createFromDiffResult(this.shouldIgnoreTrimWhitespace, rawChanges[i], this.original, this.modified, this._continueProcessingPredicate.bind(this), this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));
			}
			return lineChanges;
		}

		// Need to post-process and introduce changes where the trim whitespace is different
		// Note that we are looping starting at -1 to also cover the lines before the first change
		let result: LineChange[] = [];

		let originalLineIndex = 0;
		let modifiedLineIndex = 0;
		for (let i = -1 /* !!!! */, len = rawChanges.length; i < len; i++) {
			const nextChange = (i + 1 < len ? rawChanges[i + 1] : null);
			const originalStop = (nextChange ? nextChange.originalStart : this.originalLines.length);
			const modifiedStop = (nextChange ? nextChange.modifiedStart : this.modifiedLines.length);

			while (originalLineIndex < originalStop && modifiedLineIndex < modifiedStop) {
				const originalLine = this.originalLines[originalLineIndex];
				const modifiedLine = this.modifiedLines[modifiedLineIndex];

				if (originalLine !== modifiedLine) {
					// These lines differ only in trim whitespace

					// Check the leading whitespace
					{
						let originalStartColumn = LineMarkerSequence._getFirstNonBlankColumn(originalLine, 1);
						let modifiedStartColumn = LineMarkerSequence._getFirstNonBlankColumn(modifiedLine, 1);
						while (originalStartColumn > 1 && modifiedStartColumn > 1) {
							const originalChar = originalLine.charCodeAt(originalStartColumn - 2);
							const modifiedChar = modifiedLine.charCodeAt(modifiedStartColumn - 2);
							if (originalChar !== modifiedChar) {
								break;
							}
							originalStartColumn--;
							modifiedStartColumn--;
						}

						if (originalStartColumn > 1 || modifiedStartColumn > 1) {
							this._pushTrimWhitespaceCharChange(result,
								originalLineIndex + 1, 1, originalStartColumn,
								modifiedLineIndex + 1, 1, modifiedStartColumn
							);
						}
					}

					// Check the trailing whitespace
					{
						let originalEndColumn = LineMarkerSequence._getLastNonBlankColumn(originalLine, 1);
						let modifiedEndColumn = LineMarkerSequence._getLastNonBlankColumn(modifiedLine, 1);
						const originalMaxColumn = originalLine.length + 1;
						const modifiedMaxColumn = modifiedLine.length + 1;
						while (originalEndColumn < originalMaxColumn && modifiedEndColumn < modifiedMaxColumn) {
							const originalChar = originalLine.charCodeAt(originalEndColumn - 1);
							const modifiedChar = originalLine.charCodeAt(modifiedEndColumn - 1);
							if (originalChar !== modifiedChar) {
								break;
							}
							originalEndColumn++;
							modifiedEndColumn++;
						}

						if (originalEndColumn < originalMaxColumn || modifiedEndColumn < modifiedMaxColumn) {
							this._pushTrimWhitespaceCharChange(result,
								originalLineIndex + 1, originalEndColumn, originalMaxColumn,
								modifiedLineIndex + 1, modifiedEndColumn, modifiedMaxColumn
							);
						}
					}
				}
				originalLineIndex++;
				modifiedLineIndex++;
			}

			if (nextChange) {
				// Emit the actual change
				result.push(LineChange.createFromDiffResult(this.shouldIgnoreTrimWhitespace, nextChange, this.original, this.modified, this._continueProcessingPredicate.bind(this), this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));

				originalLineIndex += nextChange.originalLength;
				modifiedLineIndex += nextChange.modifiedLength;
			}
		}

		return result;
	}

	private _pushTrimWhitespaceCharChange(
		result: LineChange[],
		originalLineNumber: number, originalStartColumn: number, originalEndColumn: number,
		modifiedLineNumber: number, modifiedStartColumn: number, modifiedEndColumn: number
	): void {
		if (this._mergeTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn)) {
			// Merged into previous
			return;
		}

		let charChanges: CharChange[] | undefined = undefined;
		if (this.shouldComputeCharChanges) {
			charChanges = [new CharChange(
				originalLineNumber, originalStartColumn, originalLineNumber, originalEndColumn,
				modifiedLineNumber, modifiedStartColumn, modifiedLineNumber, modifiedEndColumn
			)];
		}
		result.push(new LineChange(
			originalLineNumber, originalLineNumber,
			modifiedLineNumber, modifiedLineNumber,
			charChanges
		));
	}

	private _mergeTrimWhitespaceCharChange(
		result: LineChange[],
		originalLineNumber: number, originalStartColumn: number, originalEndColumn: number,
		modifiedLineNumber: number, modifiedStartColumn: number, modifiedEndColumn: number
	): boolean {
		const len = result.length;
		if (len === 0) {
			return false;
		}

		const prevChange = result[len - 1];

		if (prevChange.originalEndLineNumber === 0 || prevChange.modifiedEndLineNumber === 0) {
			// Don't merge with inserts/deletes
			return false;
		}

		if (prevChange.originalEndLineNumber + 1 === originalLineNumber && prevChange.modifiedEndLineNumber + 1 === modifiedLineNumber) {
			prevChange.originalEndLineNumber = originalLineNumber;
			prevChange.modifiedEndLineNumber = modifiedLineNumber;
			if (this.shouldComputeCharChanges) {
				prevChange.charChanges!.push(new CharChange(
					originalLineNumber, originalStartColumn, originalLineNumber, originalEndColumn,
					modifiedLineNumber, modifiedStartColumn, modifiedLineNumber, modifiedEndColumn
				));
			}
			return true;
		}

		return false;
	}

	private _continueProcessingPredicate(): boolean {
		if (this.maximumRunTimeMs === 0) {
			return true;
		}
		const now = (new Date()).getTime();
		return now - this.computationStartTime < this.maximumRunTimeMs;
	}

}
